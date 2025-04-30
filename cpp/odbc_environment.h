#pragma once
#include <memory>
#include <vector>
#include <odbc_handles.h>
#include <odbc_error.h>

namespace mssql {

// Interface for ODBC environment functionality that can be mocked
class IOdbcEnvironment {
public:
    virtual ~IOdbcEnvironment() = default;
    
    // Initialize the ODBC environment
    virtual bool Initialize() = 0;
    
    // Get the environment handle
    virtual OdbcEnvironmentHandle& GetEnvironmentHandle() = 0;
    
    // Read errors from environment
    virtual void ReadErrors(std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> errors) = 0;
};

// Concrete implementation of the ODBC environment interface
class OdbcEnvironment : public IOdbcEnvironment {
public:
    OdbcEnvironment();
    ~OdbcEnvironment() override;
    
    // Initialize the ODBC environment
    bool Initialize() override;
    
    // Get the environment handle
    OdbcEnvironmentHandle& GetEnvironmentHandle() override;
    
    // Read errors from environment
    void ReadErrors(std::shared_ptr<std::vector<std::shared_ptr<OdbcError>>> errors) override;
    
private:
    OdbcEnvironmentHandle environment_;
};

// Factory for creating environment instances
class OdbcEnvironmentFactory {
public:
    static std::shared_ptr<IOdbcEnvironment> CreateEnvironment();
};

} // namespace mssql