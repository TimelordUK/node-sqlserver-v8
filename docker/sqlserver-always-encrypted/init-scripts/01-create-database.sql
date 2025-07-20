-- Create the 'node' database for msnodesqlv8 testing
USE master;
GO

-- Drop database if it exists
IF EXISTS (SELECT name FROM sys.databases WHERE name = N'node')
BEGIN
    ALTER DATABASE [node] SET SINGLE_USER WITH ROLLBACK IMMEDIATE;
    DROP DATABASE [node];
END
GO

-- Create the database
CREATE DATABASE [node];
GO

-- Configure database for Always Encrypted
ALTER DATABASE [node] SET ALLOW_SNAPSHOT_ISOLATION ON;
GO

ALTER DATABASE [node] SET READ_COMMITTED_SNAPSHOT ON;
GO

-- Switch to the node database
USE [node];
GO

-- Create a test table for basic functionality
CREATE TABLE dbo.test_basic (
    id INT IDENTITY(1,1) PRIMARY KEY,
    name NVARCHAR(50) NOT NULL,
    description NVARCHAR(255),
    created_date DATETIME2 DEFAULT GETDATE()
);
GO

-- Insert some test data
INSERT INTO dbo.test_basic (name, description) VALUES
    ('Test Record 1', 'Basic test data for msnodesqlv8'),
    ('Test Record 2', 'Another test record'),
    ('Test Record 3', 'Third test record for validation');
GO

PRINT 'Database [node] created successfully with test data';
GO