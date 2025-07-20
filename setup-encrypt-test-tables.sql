-- Setup script for encrypt.test.js
-- Run this in your Docker SQL Server instance to create the necessary tables
-- Note: This creates regular (non-encrypted) tables for basic testing
-- For full Always Encrypted testing, you'll need to set up certificates from a Windows client

USE master;
GO

-- Create test database if it doesn't exist
IF NOT EXISTS (SELECT name FROM sys.databases WHERE name = 'TestAlwaysEncrypted')
BEGIN
    CREATE DATABASE TestAlwaysEncrypted;
END
GO

USE TestAlwaysEncrypted;
GO

-- Drop existing objects if they exist
IF EXISTS (SELECT * FROM sys.procedures WHERE name = 'proc_insert_test_encrpted_table')
    DROP PROCEDURE proc_insert_test_encrpted_table;
GO

IF EXISTS (SELECT * FROM sys.tables WHERE name = 'test_encrpted_table')
    DROP TABLE test_encrpted_table;
GO

-- Create the main test table
CREATE TABLE test_encrpted_table (
    id INT IDENTITY(1,1) PRIMARY KEY,
    field NVARCHAR(100)
);
GO

-- Create stored procedure for insertions
CREATE PROCEDURE proc_insert_test_encrpted_table
    @field NVARCHAR(100)
AS
BEGIN
    INSERT INTO test_encrpted_table (field) VALUES (@field);
    SELECT SCOPE_IDENTITY() as id;
END;
GO

-- Create additional tables used in the encrypt tests
-- (Check the test file for any other tables needed)

-- Table for testing different data types with encryption
CREATE TABLE test_encrypted_types (
    id INT IDENTITY(1,1) PRIMARY KEY,
    text_field NVARCHAR(100),
    int_field INT,
    bit_field BIT,
    date_field DATE,
    datetime_field DATETIME2,
    money_field MONEY
);
GO

-- Stored procedure for the types table
CREATE PROCEDURE proc_insert_test_encrypted_types
    @text_field NVARCHAR(100),
    @int_field INT,
    @bit_field BIT,
    @date_field DATE,
    @datetime_field DATETIME2,
    @money_field MONEY
AS
BEGIN
    INSERT INTO test_encrypted_types 
        (text_field, int_field, bit_field, date_field, datetime_field, money_field)
    VALUES 
        (@text_field, @int_field, @bit_field, @date_field, @datetime_field, @money_field);
    SELECT SCOPE_IDENTITY() as id;
END;
GO

-- Grant permissions (for testing)
GRANT EXECUTE ON proc_insert_test_encrpted_table TO PUBLIC;
GRANT EXECUTE ON proc_insert_test_encrypted_types TO PUBLIC;
GO

-- Insert some test data
INSERT INTO test_encrpted_table (field) VALUES ('Test Value 1');
INSERT INTO test_encrpted_table (field) VALUES ('Test Value 2');
INSERT INTO test_encrpted_table (field) VALUES ('Test Value 3');
GO

PRINT 'Setup completed successfully!';
PRINT 'Tables created:';
PRINT '  - test_encrpted_table';
PRINT '  - test_encrypted_types';
PRINT 'Stored procedures created:';
PRINT '  - proc_insert_test_encrpted_table';
PRINT '  - proc_insert_test_encrypted_types';
GO