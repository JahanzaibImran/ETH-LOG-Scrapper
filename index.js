import axios from 'axios';
import * as cheerio from 'cheerio';
import { parse } from 'json2csv';
import fs from 'fs';
import chalk from 'chalk';
import { promisify } from 'util';
const sleep = promisify(setTimeout);

// ===== CONFIGURATION =====
const config = {
  BASE_URL: 'https://ethglobal.com/showcase',
  MAX_PAGES: 10000,           // Adjust based on how many pages you want to scrape
  CONCURRENT_PAGES: 100,     // Pages processed in parallel
  CONCURRENT_PROJECTS: 10, // Projects processed in parallel
  DELAY_BETWEEN_BATCHES: 2000, // Delay between batches (ms)
  MAX_RETRIES: 3,          // Max retries for failed requests
  RETRY_DELAY: 3000,       // Delay between retries (ms)
  OUTPUT_CSV: 'ethglobal_projects.csv',
  OUTPUT_FAILED_JSON: 'ethglobal_failed_projects.json',
  USER_AGENT: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.4951.64 Safari/537.36',
  TIMEOUT: 10000,          // Request timeout (ms)
};

// ===== LOGGER SETUP =====
const logger = {
    
  info: (msg) => console.log(chalk.blue(`[INFO] ${msg}`)),
  success: (msg) => console.log(chalk.green(`[SUCCESS] ${msg}`)),
  warn: (msg) => console.log(chalk.yellow(`[WARNING] ${msg}`)),
  error: (msg) => console.log(chalk.red(`[ERROR] ${msg}`)),
  progress: (current, total, type = 'pages') => {
    const percent = ((current / total) * 100).toFixed(1);
    console.log(chalk.cyan(`[PROGRESS] Scraping ${type}: ${current}/${total} (${percent}%)`));
  },
};

// ===== MAIN FUNCTION =====
async function main() {
  logger.info('🚀 Starting EthGlobal Scraper...');
  const startTime = Date.now();

  try {
    // 1️⃣ Discover all project URLs
    logger.info('🔍 Discovering project URLs...');
    const projectUrls = await discoverProjectUrls();
    logger.success(`✅ Found ${projectUrls.length} projects to scrape.`);

    // 2️⃣ Scrape all projects in batches
    logger.info('🔄 Scraping project details...');
    const { successfulProjects, failedProjects } = await processAllProjects(projectUrls);

    // 3️⃣ Save results
    await saveResults(successfulProjects, failedProjects);

    // 4️⃣ Print summary
    const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(2);
    logger.success(`\n✨ Scraping completed in ${duration} minutes`);
    logger.success(`📊 Success rate: ${successfulProjects.length}/${successfulProjects.length + failedProjects.length} (${((successfulProjects.length/(successfulProjects.length + failedProjects.length))*100).toFixed(1)}%)`);

  } catch (error) {
    logger.error(`💥 Fatal error: ${error.message}`);
    process.exit(1);
  }
}

// ===== HELPER FUNCTIONS =====

/** Discover all project URLs across pages */
async function discoverProjectUrls() {
  const allUrls = [];
  let currentPage = 1;
  let hasMorePages = true;

  while (hasMorePages && currentPage <= config.MAX_PAGES) {
    const batchPromises = [];
    const pagesToProcess = Math.min(config.CONCURRENT_PAGES, config.MAX_PAGES - currentPage + 1);

    // Process pages in parallel
    for (let i = 0; i < pagesToProcess; i++) {
      batchPromises.push(discoverUrlsOnPage(currentPage + i));
    }

    const batchResults = await Promise.all(batchPromises);
    for (const { urls, hasNextPage } of batchResults) {
      allUrls.push(...urls);
      hasMorePages = hasNextPage;
    }

    logger.progress(currentPage, config.MAX_PAGES, 'pages');
    currentPage += pagesToProcess;

    if (hasMorePages && currentPage <= config.MAX_PAGES) {
      await sleep(config.DELAY_BETWEEN_BATCHES);
    }
  }

  return [...new Set(allUrls)]; // Remove duplicates
}

/** Extract project URLs from a single page */
async function discoverUrlsOnPage(page) {
  for (let attempt = 0; attempt <= config.MAX_RETRIES; attempt++) {
    try {
      const url = `${config.BASE_URL}?page=${page}`;
      logger.info(`🌐 Fetching page ${page}...`);

      const response = await axios.get(url, {
        headers: { 'User-Agent': config.USER_AGENT },
        timeout: config.TIMEOUT,
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }

      const $ = cheerio.load(response.data);
      const urls = $('a.block.border-2.border-black.rounded.overflow-hidden.relative')
        .map((i, el) => 'https://ethglobal.com' + $(el).attr('href')).get();

      const hasNextPage = $(`a[href*="page=${page + 1}"]`).length > 0;

      return { urls, hasNextPage };

    } catch (error) {
      if (attempt === config.MAX_RETRIES) {
        logger.error(`❌ Failed to fetch page ${page}: ${error.message}`);
        return { urls: [], hasNextPage: false };
      }
      await sleep(config.RETRY_DELAY);
    }
  }
}

/** Process all projects in batches */
async function processAllProjects(projectUrls) {
  const successfulProjects = [];
  const failedProjects = [];
  const batchSize = config.CONCURRENT_PROJECTS;

  for (let i = 0; i < projectUrls.length; i += batchSize) {
    const batchUrls = projectUrls.slice(i, i + batchSize);
    const batchPromises = batchUrls.map(url => processProject(url));

    const batchResults = await Promise.all(batchPromises);
    batchResults.forEach(result => {
      if (result.status === 'success') {
        successfulProjects.push(result);
      } else {
        failedProjects.push(result);
      }
    });

    logger.progress(i + batchResults.length, projectUrls.length, 'projects');
    
    if (i + batchSize < projectUrls.length) {
      await sleep(config.DELAY_BETWEEN_BATCHES);
    }
  }

  return { successfulProjects, failedProjects };
}

/** Scrape details of a single project */
async function processProject(url) {
  for (let attempt = 0; attempt <= config.MAX_RETRIES; attempt++) {
    try {
      logger.info(`📂 Fetching project: ${url}`);
      const response = await axios.get(url, {
        headers: { 'User-Agent': config.USER_AGENT },
        timeout: config.TIMEOUT,
      });

      if (response.status !== 200) {
        throw new Error(`HTTP ${response.status}`);
      }

      const project = parseProjectDetails(response.data, url);
      return { ...project, status: 'success' };

    } catch (error) {
      if (attempt === config.MAX_RETRIES) {
        logger.error(`❌ Failed to fetch project: ${url} (${error.message})`);
        return {
          url,
          error: error.message,
          name: 'Failed to load project',
          status: 'failed',
        };
      }
      await sleep(config.RETRY_DELAY);
    }
  }
}

/** Parse HTML to extract project details */
function parseProjectDetails(html, url) {
  const $ = cheerio.load(html);

  const name = $('h1.text-4xl, h2.text-2xl').first().text().trim() || 
               url.split('/').pop().replace(/-/g, ' ');

  const description = $('h3:contains("Project Description"), h2:contains("Project Description")')
    .first().next('div').text().trim();

  const howItsMade = $('h3:contains("How it\'s Made"), h2:contains("How it\'s Made")')
    .first().next('div').text().trim();

  // Extract social links
  const links = {};
  $('a[target="_blank"]').each((i, el) => {
    const href = $(el).attr('href');
    const text = $(el).text().trim().toLowerCase();

    if (href.includes('github.com')) links.github = href;
    else if (href.includes('twitter.com') || href.includes('x.com')) links.twitter = href;
    else if (href.includes('discord.gg') || text.includes('discord')) links.discord = href;
    else if (text.includes('website') || text.includes('site') || text.includes('Live Demo')) links.website = href;
    else if (href.includes('linkedin.com')) links.linkedin = href;
  });

  // Extract sponsors/prizes
  const sponsors = [];
  $('img[alt^="prize"], img[alt^="sponsor"]').each((i, el) => {
    sponsors.push($(el).attr('alt'));
  });

  return {
    name,
    url,
    event: $('a[href^="/events"]').first().text().trim() || 'Unknown Event',
    description,
    howItsMade,
    technologies: extractTechnologies(description + ' ' + howItsMade).join(', '),
    github: links.github || '',
    twitter: links.twitter || '',
    website: links.website || '',
    discord: links.discord || '',
    linkedin: links.linkedin || '',
    sponsors: sponsors.join(', '),
    lastUpdated: new Date().toISOString(),
  };
}

/** Extract tech keywords from text */
function extractTechnologies(text) {
  const techKeywords = [
    'Ethereum', 'Solidity', 'Polygon', 'zkSync', 'Starknet', 'IPFS', 'The Graph',
    'React', 'Next.js', 'Hardhat', 'Foundry', 'Wagmi', 'Ethers.js', 'Web3.js',
    'NFT', 'DeFi', 'Smart Contracts', 'ZK-SNARKs', 'ERC-20', 'ERC-721',
  ];

  const found = [];
  for (const keyword of techKeywords) {
    if (new RegExp(`\\b${keyword}\\b`, 'i').test(text)) {
      found.push(keyword);
    }
  }
  return [...new Set(found)]; // Remove duplicates
}

/** Save results to CSV & JSON */
async function saveResults(successfulProjects, failedProjects) {
  try {
    const fields = [
      'name', 'url', 'event', 'description', 'howItsMade',
      'technologies', 'github', 'twitter', 'website', 'discord',
      'sponsors', 'lastUpdated',
    ];

    const csv = parse(successfulProjects, { fields });
    fs.writeFileSync(config.OUTPUT_CSV, csv);
    logger.success(`💾 Saved ${successfulProjects.length} projects to ${config.OUTPUT_CSV}`);

    if (failedProjects.length > 0) {
      fs.writeFileSync(config.OUTPUT_FAILED_JSON, JSON.stringify(failedProjects, null, 2));
      logger.warn(`⚠️  ${failedProjects.length} projects failed (saved to ${config.OUTPUT_FAILED_JSON})`);
    }

  } catch (err) {
    logger.error(`💥 Failed to save results: ${err.message}`);
  }
}

// 🚀 Run the scraper
main();