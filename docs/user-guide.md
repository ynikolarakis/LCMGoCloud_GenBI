# GenBI Platform — User Guide

## Overview

GenBI is a Generative Business Intelligence platform that lets you query your databases using natural language. Ask questions like "What were the top 10 products by revenue last month?" and get SQL, results, and auto-generated charts.

## Getting Started

### 1. Create a Database Connection

1. Navigate to **Connections** from the top navigation
2. Click **Add Connection**
3. Fill in the connection details:
   - **Connection Name**: A friendly name (e.g., "Production Sales DB")
   - **Database Type**: PostgreSQL, MySQL, or SQL Server
   - **Host/Port**: Database server address and port
   - **Database Name**: Target database
   - **Username/Password**: Database credentials
   - **SSL**: Enable for production databases
4. Click **Create Connection**

### 2. Discover Your Schema

1. From the Connections list, click **Schema** on your connection
2. Click **Discover Schema** to auto-detect tables, columns, and relationships
3. Review the discovered schema in the left panel

### 3. Enrich Your Schema (Recommended)

Enrichment adds business context that helps the AI generate better SQL. The more context you provide, the more accurate the results.

#### Table Enrichment
- Select a table from the left panel
- Click **Edit Enrichment**
- Add: display name, description, business purpose, tags
- Click **Save**

#### Column Enrichment
- Click on a column in the table detail view
- Click **Edit Enrichment**
- Add: display name, description, business meaning, synonyms
- Click **Save**

#### Database-Level Enrichment
- Scroll to the bottom of the Schema page
- Click **Edit** under Database-Level Enrichment
- Add: display name, description, business domain

#### Enrichment Score
The score banner at the top shows your enrichment completeness. Aim for 80%+ for best results. The recommendations section suggests what to enrich next.

### 4. Ask Questions

1. Navigate to **Chat** from the top navigation
2. Select a connection from the dropdown
3. Type a natural language question and click **Ask**
4. View the results:
   - **Explanation**: What the AI found
   - **SQL**: The generated query (click to expand)
   - **Visualization**: Auto-selected chart type
   - **Follow-up suggestions**: Click to ask related questions

#### Tips for Better Questions
- Be specific: "Show me revenue by product category for Q4 2024" > "Show revenue"
- Use business terms that match your enrichment
- Reference table/column names when ambiguous
- Use follow-up questions for multi-step analysis

### 5. Visualizations

Results auto-select the best chart type:
- **KPI**: Single numeric value (e.g., total count)
- **Pie**: 2-6 categories with values
- **Bar**: Many categories with values
- **Line/Time Series**: Date-based data with trends
- **Table**: Text data or complex results

You can manually switch chart types using the buttons above the visualization.

### 6. Export Results

Three export formats are available for every query result:
- **CSV**: Comma-separated values (opens in Excel/Sheets)
- **Excel**: Native .xlsx with auto-sized columns
- **PDF**: Formatted PDF with table layout

Click the export button above any result visualization.

### 7. Dashboard

Pin important results to your dashboard for quick reference:
1. In Chat, click **Pin to dashboard** below any result
2. Navigate to **Dashboard** to see all pinned items
3. Use **Remove** to unpin individual cards
4. Use **Clear all** to reset the dashboard

Dashboards are saved to the backend and persist across sessions.

## Supported Databases

| Database | Versions | Features |
|----------|----------|----------|
| PostgreSQL | 12+ | Full support, async connections |
| MySQL/MariaDB | 5.7+ / 10.3+ | Full support, async connections |
| SQL Server | 2016+ | Full support |

## Security

- Database credentials are stored in AWS Secrets Manager (never in the database)
- All generated SQL is validated to block: INSERT, UPDATE, DELETE, DROP, ALTER, and other write operations
- Query execution has configurable timeouts and row limits
- Optional Cognito authentication for user access control
- Rate limiting prevents API abuse

## FAQ

**Q: Can GenBI modify my database?**
A: No. All generated SQL is validated to ensure it's read-only. Write operations are blocked at the application level. For additional safety, connect using a read-only database user.

**Q: What LLM model is used?**
A: Amazon Bedrock with Claude (configurable model ID). Your data stays in your AWS account and is never sent to external services.

**Q: Can I use GenBI with multiple databases?**
A: Yes. Create a connection for each database. Switch between them in the Chat page dropdown.

**Q: How do I improve query accuracy?**
A: Enrich your schema. Add descriptions, business purposes, and synonyms to tables and columns. The enrichment score shows your progress.
