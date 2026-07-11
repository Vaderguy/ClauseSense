# ClauseSense
AI-powered legal document analyzer that summarizes contracts, identifies key clauses, and highlights potential legal risks through an intuitive web interface.
#

ClauseSense is an AI-powered web application that helps users analyze legal contracts using a locally hosted Large Language Model (LLM) through Ollama. Users can upload contracts and receive concise summaries, identify key clauses, and understand potential legal risks—all while keeping their documents private by processing them locally.

---

## Features

* 📄 Upload legal contracts for analysis
* 🤖 AI-generated contract summaries
* ⚖️ Identification of important legal clauses
* 🚩 Detection of potential risks and concerns
* 🔒 Privacy-focused local AI processing with Ollama
* 📱 Responsive and user-friendly interface

---

## Tech Stack

### Frontend

* HTML5
* CSS3
* JavaScript (Vanilla)

### Backend

* Node.js
* Express.js

### AI

* Ollama
* Local Large Language Model (e.g., Mistral)

---

## Project Structure

```
ai-legal-sentinel/
│
├── public/
│   ├── index.html
│   ├── style.css
│   ├── script.js
│
├── uploads/
│
├── server.js
├── package.json
├── package-lock.json
├── .gitignore
├── README.md
└── screenshots/
```

---

## How It Works

1. The user uploads a legal contract.
2. The Express backend receives and processes the document.
3. The extracted content is sent to a locally running Ollama model.
4. The AI analyzes the contract and generates insights.
5. The results are displayed in an easy-to-read format on the website.

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/yourusername/ai-legal-sentinel.git
```

### 2. Navigate to the project

```bash
cd ai-legal-sentinel
```

### 3. Install dependencies

```bash
npm install
```

### 4. Start Ollama

```bash
ollama serve
```

### 5. Download the required model (if needed)

```bash
ollama pull mistral
```

### 6. Start the server

```bash
node server.js
```

### 7. Open the application

Visit:

```
http://localhost:3000
```

---

## Screenshots

Add screenshots of:

* Home Page
* Contract Upload
* AI Analysis Results

---

## Future Enhancements

* Support for multiple document formats
* OCR for scanned PDFs
* Clause comparison between contracts
* Export AI analysis as PDF
* User authentication and saved analysis history
* Enhanced risk scoring and recommendations

---

## License

This project is licensed under the MIT License.

---

## Author

**Neil Coleston**
