# GenBI Platform

Generative Business Intelligence platform that enables organizations to interact with their data through natural language.

## Architecture

- **Backend:** Python FastAPI on AWS Lambda (via Mangum)
- **Frontend:** React + TypeScript + Tailwind CSS (Vite)
- **Metadata DB:** PostgreSQL (Amazon RDS)
- **LLM:** Amazon Bedrock (Claude)
- **IaC:** Terraform
- **Auth:** Amazon Cognito

## Project Structure

```
genbi-platform/
├── docs/decisions/        # Architecture Decision Records
├── backend/               # Python FastAPI backend
│   ├── src/
│   │   ├── api/           # API routes
│   │   ├── services/      # Business logic
│   │   ├── models/        # Pydantic data models
│   │   ├── repositories/  # Database access
│   │   ├── connectors/    # DB connectors (mssql, mysql, pg)
│   │   └── utils/
│   └── tests/
├── frontend/              # React TypeScript frontend
│   └── src/
├── infrastructure/        # Terraform modules
│   └── terraform/
└── README.md
```

## Quick Start

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate      # Windows
pip install -r requirements.txt
uvicorn src.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Decision Records

All architecture decisions are documented in `docs/decisions/`. See:

- [0001 - Backend Framework (FastAPI)](docs/decisions/0001-backend-framework.md)
- [0002 - Frontend Framework (React)](docs/decisions/0002-frontend-framework.md)
- [0003 - IaC Tool (Terraform)](docs/decisions/0003-iac-tool.md)
- [0004 - Database Connectors](docs/decisions/0004-database-connectors.md)
- [0005 - Metadata Storage (PostgreSQL)](docs/decisions/0005-metadata-storage.md)
