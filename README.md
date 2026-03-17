# InsightAI — Executive BI Dashboard

AI-powered natural language data analytics dashboard built for hackathon.

Ask questions in plain English → get SQL, interactive charts, KPIs, and executive insights.

## Architecture

```
User Question (Natural Language)
        ↓
  FastAPI Backend
        ↓
  Gemini 2.5 Flash AI
        ↓
  SQL Generation + Chart Config
        ↓
  SQLite Database (1M rows)
        ↓
  Query Results
        ↓
  Next.js Frontend
        ↓
  Recharts Visualization + KPI Cards + AI Insight
```

## Tech Stack

| Layer    | Technology                        |
|----------|-----------------------------------|
| Frontend | Next.js 16, React 19, Tailwind CSS, Recharts |
| Backend  | FastAPI, Python, SQLite           |
| AI       | Google Gemini 2.5 Flash           |
| Database | SQLite (1,000,000 rows)           |

## Features

### Core Features
- Natural language to SQL conversion via Gemini AI
- Dynamic chart generation (bar, grouped bar, line, area, pie, donut, scatter)
- KPI metric cards with trends
- AI-generated executive insights with actual numbers
- SQL validation and injection prevention

### Nice-to-Have Features
- Multi-chart dashboard per query
- Query history sidebar with persistence
- Suggested/example queries for guidance
- Raw data table toggle (sortable, paginated)
- Dark/Light mode toggle
- Export chart as PNG / data as CSV

### Bonus Features
- Follow-up questions with conversational context
- CSV upload for custom datasets


## Quick Start

### Prerequisites
- Python 3.11+
- Node.js 18+
- Gemini API Key (from https://aistudio.google.com/app/apikey)

### Backend Setup

```bash
cd backend

python -m venv venv

# Windows PowerShell
venv\Scripts\Activate.ps1

# Mac/Linux
# source venv/bin/activate

pip install fastapi uvicorn python-dotenv google-generativeai pydantic python-multipart pandas

# Add your Gemini API key
echo GEMINI_API_KEY=your_key_here > .env

# Load data into SQLite
python data\load_db.py

# Start API server
python -m uvicorn main:app --reload --port 8000
```

### Frontend Setup

```bash
cd frontend

npm install

npm run dev
```

### Open Dashboard

Navigate to http://localhost:3000

## Demo Queries

| Difficulty | Query |
|------------|-------|
| Simple     | "Show me the total views by category" |
| Medium     | "Compare average likes, comments, and shares for monetized vs non-monetized videos across regions" |
| Complex    | "Show me the monthly trend of average sentiment score for the top 3 categories by views in 2025, and highlight which months had negative sentiment" |

## Project Structure

```
matriq-backend/
├── backend/
│   ├── main.py                  # FastAPI entry point
│   ├── routes/
│   │   └── query.py             # API endpoints
│   ├── services/
│   │   ├── gemini_service.py    # Gemini AI integration
│   │   ├── db_service.py        # SQLite query executor
│   │   └── prompt_builder.py    # Structured prompt builder
│   ├── models/
│   │   └── schemas.py           # Pydantic models
│   ├── data/
│   │   ├── youtube_data.csv     # Raw dataset (1M rows)
│   │   └── load_db.py           # CSV → SQLite loader
│   ├── .env                     # GEMINI_API_KEY
│   └── database.db              # SQLite database
│
├── frontend/
│   ├── src/
│   │   ├── app/
│   │   │   ├── page.tsx         # Main page
│   │   │   ├── layout.tsx       # App layout
│   │   │   └── globals.css      # Global styles
│   │   ├── components/
│   │   │   ├── Dashboard.tsx    # Main dashboard
│   │   │   ├── ChatInput.tsx    # Query input
│   │   │   ├── ChartRenderer.tsx # Dynamic charts
│   │   │   ├── KPICards.tsx     # Metric cards
│   │   │   ├── InsightBox.tsx   # AI insight display
│   │   │   ├── QueryHistory.tsx # History sidebar
│   │   │   ├── DataTable.tsx    # Raw data table
│   │   │   ├── ExportButtons.tsx # PNG/CSV export
│   │   │   ├── CSVUpload.tsx    # File upload
│   │   │   ├── LoadingState.tsx # Loading skeleton
│   │   │   └── ThemeProvider.tsx # Dark/light mode
│   │   ├── services/
│   │   │   └── api.ts           # API client
│   │   └── types/
│   │       └── index.ts         # TypeScript types
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   └── .env.local               # API URL config
│
├── .gitignore
├── .env.example
└── README.md
```

## API Endpoints

| Method | Endpoint         | Description              |
|--------|------------------|--------------------------|
| GET    | /                | Health check             |
| GET    | /api/schema      | Database schema info     |
| GET    | /api/suggestions | Example queries          |
| POST   | /api/query       | Process NL query         |
| POST   | /api/upload      | Upload custom CSV        |

## Installation & Running

### Run Both Backend and Frontend

1. **Start Backend Server**
   ```bash
   cd backend
   python -m venv venv
   venv\Scripts\Activate.ps1  # Windows
   # source venv/bin/activate  # Mac/Linux
   pip install -r requirements.txt
   python -m uvicorn main:app --reload --port 8000
   ```

2. **Start Frontend Server (in new terminal)**
   ```bash
   cd frontend
   npm install
   npm run dev
   ```

3. **Access Dashboard**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:8000
   - API Docs: http://localhost:8000/docs

## Environment Variables

### Backend (.env)
```
GEMINI_API_KEY=your_gemini_api_key_here
DATABASE_URL=sqlite:///./database.db
```

### Frontend (.env.local)
```
NEXT_PUBLIC_API_URL=http://localhost:8000
```

## Technologies Used

### Backend
- **FastAPI** - Modern, fast Python web framework
- **SQLite** - Lightweight SQL database
- **Google Gemini** - AI for natural language processing
- **Pydantic** - Data validation using Python type hints

### Frontend
- **Next.js 16** - React framework for production
- **React 19** - JavaScript library for UI
- **Tailwind CSS** - Utility-first CSS framework
- **Recharts** - Composable React chart library
- **TypeScript** - Type-safe JavaScript

## Key Features Explained

### Natural Language to SQL
Users can ask questions in plain English, and the AI converts them to SQL queries automatically.

### Dynamic Chart Generation
Based on query results, the system automatically generates appropriate charts (bar, line, pie, scatter, etc.).

### KPI Cards
Display key performance indicators with trends and comparisons.

### AI Insights
Generate human-readable insights from query results with actual numbers.

## Development Tips

1. **Hot Reload**: Both backend and frontend support hot reloading during development
2. **API Documentation**: Visit http://localhost:8000/docs for interactive API docs
3. **Database**: SQLite file is stored as `database.db` in the backend folder
4. **Styling**: Use Tailwind CSS classes in frontend components

## Testing

### Test Backend API
```bash
curl http://localhost:8000/
curl http://localhost:8000/api/schema
curl http://localhost:8000/api/suggestions
```

### Test Frontend
```bash
npm run build  # Build for production
npm run test   # Run tests
```

## Troubleshooting

### Backend Issues
- Ensure Python 3.11+ is installed
- Check GEMINI_API_KEY is set correctly
- Verify SQLite database file exists

### Frontend Issues
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check Node.js version is 18+
- Ensure backend API is running on port 8000

## Team

Built for Hackathon 2026

## License

This project is built for educational and hackathon purposes.
