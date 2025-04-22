-- 1. Create the 'node' database
USE master;
GO

IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'node')
BEGIN
    CREATE DATABASE node;
    PRINT 'Database "node" created successfully.';
END
ELSE
BEGIN
    PRINT 'Database "node" already exists.';
END
GO

-- 2. Create login and user 'node_user' if it doesn't exist
IF NOT EXISTS (SELECT name FROM master.sys.server_principals WHERE name = 'node_user')
BEGIN
    CREATE LOGIN node_user WITH PASSWORD = 'StrongPassword123!';
    PRINT 'Login "node_user" created successfully.';
END
ELSE
BEGIN
    PRINT 'Login "node_user" already exists.';
END
GO

-- 3. Create the user in the node database and grant permissions
USE node;
GO

IF NOT EXISTS (SELECT name FROM sys.database_principals WHERE name = 'node_user')
BEGIN
    CREATE USER node_user FOR LOGIN node_user;
    PRINT 'User "node_user" created successfully in database "node".';
END
ELSE
BEGIN
    PRINT 'User "node_user" already exists in database "node".';
END

-- Grant full control over the database to node_user
ALTER ROLE db_owner ADD MEMBER node_user;
PRINT 'User "node_user" has been granted db_owner permissions on database "node".';
GO