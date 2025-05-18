#include "odbc/bcp_executor.h"
#include "common/string_utils.h"
#include "utils/Logger.h"
#include "odbc/OdbcError.h"
#include <sstream>

namespace mssql {
    
    BcpExecutor::BcpExecutor(std::shared_ptr<BcpPlugin> p, HDBC conn)
        : plugin(std::move(p)), connection(conn) {
        if (!plugin || !plugin->isLoaded()) {
            throw std::runtime_error("BCP plugin not loaded");
        }
    }
    
    BcpExecutor::~BcpExecutor() {
        // Clean up any BCP resources
        if (initialized && plugin) {
            // Call bcp_done if available
            if (auto done_func = plugin->getFunction<plug_bcp_done>()) {
                done_func(connection);
            }
        }
    }
    
    bool BcpExecutor::init(const std::string& table, const std::vector<std::string>& columns) {
        if (!plugin || initialized) return false;
        
        auto init_func = plugin->getFunction<plug_bcp_init>();
        if (!init_func) return false;
        
        // Convert table name to wide string
        auto wide_table = StringUtils::Utf8ToU16String(table);
        
        // If columns specified, build format file path (optional)
        const SQLWCHAR* format_file = nullptr;
        
        // Direction: DB_IN for insertion
        RETCODE ret = init_func(connection, 
                               reinterpret_cast<const SQLWCHAR*>(wide_table.c_str()),  // table name
                               nullptr,             // data file (not used for in-memory)
                               format_file,         // format file (optional)
                               DB_IN);             // direction
        
        if (ret == SUCCEED) {
            initialized = true;
            table_name = table;
        }
        
        return initialized;
    }
    
    bool BcpExecutor::bindColumn(int column_num, 
                               const std::shared_ptr<DatumStorage>& storage,
                               const std::vector<SQLLEN>& indicators,
                               int sql_type,
                               size_t buffer_len) {
        if (!initialized || !plugin) return false;
        
        auto bind_func = plugin->getFunction<plug_bcp_bind>();
        if (!bind_func) return false;
        
        // Create BCP storage for this column
        std::shared_ptr<BcpStorage> bcp_storage;
        
        // For now, handle integers specially to bypass DatumStorage issues
        try {
            if (sql_type == SQL_INTEGER && storage->getType() == DatumStorage::SqlType::Integer) {
                // Create a simple integer storage
                auto int_vec = storage->getTypedVector<int32_t>();
                bcp_storage = std::make_shared<BcpValueStorage<int32_t>>(*int_vec, indicators);
            } else {
                bcp_storage = createBcpStorage(storage, indicators, buffer_len);
            }
        } catch (const std::exception& e) {
            std::stringstream ss;
            ss << "bindColumn failed: " << e.what() 
               << ", SQL type: " << sql_type 
               << ", Storage type: " << storage->getTypeName();
            SQL_LOG_ERROR(ss.str());
            return false;
        }
        
        storage_buffers.push_back(bcp_storage);
        
        // Map SQL type to BCP type
        int bcp_type = mapSqlTypeToOdbcType(sql_type);
        int max_len = static_cast<int>(buffer_len);
        
        // For variable length types, set max_len to SQL_VARLEN_DATA
        if (sql_type == SQL_VARCHAR || sql_type == SQL_WVARCHAR || 
            sql_type == SQL_VARBINARY || sql_type == SQL_LONGVARCHAR ||
            sql_type == SQL_WLONGVARCHAR || sql_type == SQL_LONGVARBINARY) {
            max_len = SQL_VARLEN_DATA;
        }
        
        // Bind the column
        RETCODE ret = bind_func(connection,
                               bcp_storage->ptr(),      // data pointer
                               0,                       // prefix length
                               max_len,                // max data length
                               nullptr,                 // terminator
                               0,                       // terminator length
                               bcp_type,                // data type
                               column_num);             // column number (1-based)
        
        return ret == SUCCEED;
    }
    
    std::pair<bool, std::string> BcpExecutor::execute() {
        if (!initialized || storage_buffers.empty()) {
            return {false, "BCP not initialized or no columns bound"};
        }
        
        // Prepare all storage buffers
        for (auto& storage : storage_buffers) {
            storage->next();
        }
        
        // Send batches
        while (sendBatch()) {
            // Continue until all data sent
        }
        
        // Commit the batch
        auto batch_func = plugin->getFunction<plug_bcp_batch>();
        if (batch_func) {
            batch_func(connection);
        }
        
        // Done with BCP
        auto done_func = plugin->getFunction<plug_bcp_done>();
        int rows_sent = 0;
        if (done_func) {
            rows_sent = done_func(connection);
        }
        
        initialized = false;
        std::stringstream ss;
        ss << "Bulk copy completed. Rows sent: " << rows_sent;
        return {true, ss.str()};
    }
    
    bool BcpExecutor::sendBatch() {
        auto sendrow_func = plugin->getFunction<plug_bcp_sendrow>();
        if (!sendrow_func) return false;
        
        // Check if any storage has more data
        bool has_data = false;
        for (auto& storage : storage_buffers) {
            if (storage->next()) {
                has_data = true;
            }
        }
        
        if (!has_data) return false;
        
        // Send the row
        RETCODE ret = sendrow_func(connection);
        return ret == SUCCEED;
    }
    
    int BcpExecutor::getRowCount() const {
        if (!plugin) return 0;
        
        auto control_func = plugin->getFunction<plug_bcp_control>();
        if (!control_func) return 0;
        
        int rows = 0;
        control_func(connection, 20, &rows); // BCPROWCOUNT = 20
        return rows;
    }
    
    int BcpExecutor::mapSqlTypeToOdbcType(int sql_type) {
        // Use existing ODBC type constants directly
        // BCP accepts standard ODBC SQL types
        return sql_type;
    }
    
    std::shared_ptr<BcpExecutor> createBcpExecutor(HDBC connection) {
        auto plugin = BcpPlugin::getInstance();
        if (!plugin) {
            SQL_LOG_ERROR("BCP plugin instance is null");
            return nullptr;
        }
        
        if (!plugin->isLoaded()) {
            SQL_LOG_ERROR("BCP plugin is not loaded - attempting to load");
            
            // Try to load the driver library - try multiple paths
            std::vector<std::string> libPaths = {
                "/usr/lib64/libmsodbcsql-18.so",
                "/lib/libmsodbcsql-18.so",
                "/opt/microsoft/msodbcsql18/lib64/libmsodbcsql-18.5.so.1.1",
                "/opt/microsoft/msodbcsql18/lib64/libmsodbcsql-18.so",
                "/usr/lib/libmsodbcsql-18.so"
            };
            
            std::vector<std::shared_ptr<OdbcError>> errors;
            bool loaded = false;
            
            for (const auto& libPath : libPaths) {
                SQL_LOG_ERROR_STREAM("Trying to load BCP plugin from: " << libPath);
                errors.clear();
                
                if (plugin->load(libPath, errors)) {
                    SQL_LOG_ERROR_STREAM("Successfully loaded BCP plugin from: " << libPath);
                    loaded = true;
                    break;
                } else {
                    SQL_LOG_ERROR_STREAM("Failed to load BCP plugin from: " << libPath);
                    for (const auto& error : errors) {
                        SQL_LOG_ERROR("BCP load error: " + std::string(error->Message()));
                    }
                }
            }
            
            if (!loaded) {
                SQL_LOG_ERROR("Failed to load BCP plugin from any path");
                return nullptr;
            }
        }
        
        return std::make_shared<BcpExecutor>(plugin, connection);
    }
}