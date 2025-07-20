#!/bin/bash

# Setup script for SQL Server in Docker for encrypt.test.js testing

echo "Setting up SQL Server 2022 in Docker for Always Encrypted testing..."

# Configuration
CONTAINER_NAME="sql_always_encrypted"
SA_PASSWORD="YourStrong@Passw0rd"
SQL_PORT=1433

# Check if container already exists
if [ "$(docker ps -aq -f name=$CONTAINER_NAME)" ]; then
    echo "Container $CONTAINER_NAME already exists. Removing it..."
    docker stop $CONTAINER_NAME 2>/dev/null
    docker rm $CONTAINER_NAME 2>/dev/null
fi

# Start SQL Server container
echo "Starting SQL Server 2022 container..."
docker run -e "ACCEPT_EULA=Y" -e "MSSQL_SA_PASSWORD=$SA_PASSWORD" \
   -p $SQL_PORT:1433 --name $CONTAINER_NAME \
   -d mcr.microsoft.com/mssql/server:2022-latest

# Wait for SQL Server to start
echo "Waiting for SQL Server to start..."
sleep 30

# Check if SQL Server is ready
docker exec $CONTAINER_NAME /opt/mssql-tools/bin/sqlcmd \
   -S localhost -U sa -P "$SA_PASSWORD" -Q "SELECT 1" > /dev/null 2>&1

while [ $? -ne 0 ]; do
    echo "SQL Server is not ready yet. Waiting..."
    sleep 5
    docker exec $CONTAINER_NAME /opt/mssql-tools/bin/sqlcmd \
       -S localhost -U sa -P "$SA_PASSWORD" -Q "SELECT 1" > /dev/null 2>&1
done

echo "SQL Server is ready!"

# Run the setup script
echo "Creating test database and tables..."
docker exec -i $CONTAINER_NAME /opt/mssql-tools/bin/sqlcmd \
   -S localhost -U sa -P "$SA_PASSWORD" < setup-encrypt-test-tables.sql

echo "Setup completed!"
echo ""
echo "Connection details:"
echo "  Server: localhost,$SQL_PORT"
echo "  Username: sa"
echo "  Password: $SA_PASSWORD"
echo "  Database: TestAlwaysEncrypted"
echo ""
echo "Connection string for tests:"
echo "Driver={ODBC Driver 18 for SQL Server};Server=localhost,$SQL_PORT;Database=TestAlwaysEncrypted;Uid=sa;Pwd=$SA_PASSWORD;Encrypt=yes;TrustServerCertificate=yes;"
echo ""
echo "To connect manually:"
echo "docker exec -it $CONTAINER_NAME /opt/mssql-tools/bin/sqlcmd -S localhost -U sa -P '$SA_PASSWORD' -d TestAlwaysEncrypted"