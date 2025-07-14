# 🚀 EthGlobal Showcase Scraper  

A **Node.js** web scraper that extracts project details from [EthGlobal's Showcase](https://ethglobal.com/showcase) using **Axios** and **Cheerio**, with structured logging and CSV/JSON outputs.  

---

## **📦 Features**  
- **Scrapes project details** (name, description, technologies, links, sponsors)  
- **Batch processing** (concurrent requests for efficiency)  
- **Retry mechanism** (auto-retries failed requests)  
- **Progress tracking** (real-time logging with `chalk`)  
- **CSV & JSON outputs** (structured data export)  

---

## **⚙️ Setup**  

### **1. Install Dependencies**  
```bash
npm install axios cheerio json2csv chalk
```

### **2. Run the Scraper**  
```bash
node scraper.js
```

### **3. Output Files**  
| File | Description |
|------|-------------|
| `ethglobal_projects.csv` | Successful projects (CSV format) |
| `ethglobal_failed_projects.json` | Failed project attempts (JSON) |

---

## **🛠️ Configuration**  
Edit `config` in `scraper.js` to adjust:  
- `MAX_PAGES`: Number of pages to scrape  
- `CONCURRENT_REQUESTS`: Parallel request limit  
- `DELAY_BETWEEN_BATCHES`: Delay to avoid rate-limiting  

---

## **📜 License**  
MIT © [Your Name]  

---

## **💡 Improvements**  
- [ ] Add **proxy rotation** for large-scale scraping  
- [ ] Auto-detect **pagination limit** (instead of `MAX_PAGES`)  
- [ ] Store data in **SQLite/PostgreSQL**  

---

**🌟 Star this repo if you found it useful!**  
**🐛 Report issues [here](https://github.com/your-repo/issues).**  

---

### **🔗 Dependencies**  
| Package | Use Case |
|---------|----------|
| `axios` | HTTP requests |
| `cheerio` | HTML parsing |
| `json2csv` | CSV conversion |
| `chalk` | Colored logs |  

---

Made with ❤️ by [Jahanzaib Imran]
