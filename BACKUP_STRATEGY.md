# 🗄️ Database Backup & Disaster Recovery Plan

## 1. Overview
In a mission-critical Iftar delivery system, data loss is not an option. This document outlines the strategy for backing up the PostgreSQL primary database.

## 2. Automated Daily Backups (Recommended)
We use `pg_dump` to create logical backups of the `feastflow` database.

### Simple Backup Script (`scripts/backup-db.sh`)
```bash
#!/bin/bash
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_DIR="./backups"
DB_NAME="feastflow"
CONTAINER_NAME="postgres-db"

mkdir -p $BACKUP_DIR

echo "Starting backup of $DB_NAME..."
docker exec $CONTAINER_NAME pg_dump -U user -d $DB_NAME > $BACKUP_DIR/backup_$TIMESTAMP.sql

echo "Backup completed: $BACKUP_DIR/backup_$TIMESTAMP.sql"

# Keep only last 7 days
find $BACKUP_DIR -type f -mtime +7 -name "*.sql" -delete
```

## 3. Storage Strategy
- **Local**: Backups are stored in the `./backups` volume.
- **Off-site (Production)**: The script should be modified to upload the `.sql` (or compressed `.tar.gz`) file to **AWS S3** or **Google Cloud Storage**.

## 4. Recovery Procedure
If the database container dies or data is corrupted:

1. **Stop the services**: `docker-compose down`
2. **Clear the volume (CAUTION)**: `docker volume rm devops_postgres_data`
3. **Start Postgres only**: `docker-compose up -d postgres`
4. **Restore data**:
   ```bash
   cat backups/backup_YYYYMMDD_HHMMSS.sql | docker exec -i postgres-db psql -U user -d feastflow
   ```
5. **Restart all services**: `docker-compose up -d`

## 5. Point-in-Time Recovery (PITR)
For enterprise-grade production, we recommend:
- Enabling **WAL (Write Ahead Logging) Archiving**.
- Using tools like **pgBackRest** or **Barman**.
- Using **AWS RDS** Automated Backups (35-day retention) if deploying to AWS via our Terraform manifests.
