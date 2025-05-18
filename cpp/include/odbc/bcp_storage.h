#pragma once

#include <memory>
#include <vector>
#include <cstring>
#include <sql.h>
#include <sqlext.h>
#include "core/datum_storage.h"

namespace mssql {
    
    // Base storage interface for BCP operations
    class BcpStorage {
    public:
        virtual ~BcpStorage() = default;
        virtual const void* ptr() = 0;
        virtual size_t size() = 0;
        virtual bool next() = 0;
        virtual SQLLEN* indicator() = 0;
        
    protected:
        size_t index = 0;
        SQLLEN indicator_value = 0;
    };
    
    // Storage for simple value types
    template<typename T>
    class BcpValueStorage : public BcpStorage {
    private:
        const std::vector<T>& values;
        const std::vector<SQLLEN>& indicators;
        T current_value;
        
    public:
        BcpValueStorage(const std::vector<T>& v, const std::vector<SQLLEN>& i)
            : values(v), indicators(i) {}
            
        const void* ptr() override {
            return &current_value;
        }
        
        size_t size() override {
            return values.size();
        }
        
        bool next() override {
            if (index >= values.size()) return false;
            
            indicator_value = indicators[index];
            if (indicator_value != SQL_NULL_DATA) {
                current_value = values[index];
            }
            index++;
            return true;
        }
        
        SQLLEN* indicator() override {
            return &indicator_value;
        }
    };
    
    // Storage for variable-length data (strings, binary)
    template<typename T>
    class BcpVarLengthStorage : public BcpStorage {
    private:
        const std::vector<std::shared_ptr<std::vector<T>>>& values;
        const std::vector<SQLLEN>& indicators;
        std::vector<T> current_data;
        
    public:
        BcpVarLengthStorage(const std::vector<std::shared_ptr<std::vector<T>>>& v, 
                            const std::vector<SQLLEN>& i, size_t max_len)
            : values(v), indicators(i) {
            current_data.reserve(max_len);
        }
            
        const void* ptr() override {
            return current_data.data();
        }
        
        size_t size() override {
            return values.size();
        }
        
        bool next() override {
            if (index >= values.size()) return false;
            
            indicator_value = indicators[index];
            current_data.clear();
            
            if (indicator_value != SQL_NULL_DATA && values[index]) {
                const auto& src = *values[index];
                current_data.insert(current_data.end(), src.begin(), src.end());
                indicator_value = static_cast<SQLLEN>(current_data.size());
            }
            
            index++;
            return true;
        }
        
        SQLLEN* indicator() override {
            return &indicator_value;
        }
    };
    
    // Factory to create appropriate storage based on DatumStorage type
    std::shared_ptr<BcpStorage> createBcpStorage(const std::shared_ptr<DatumStorage>& storage,
                                                 const std::vector<SQLLEN>& indicators,
                                                 size_t buffer_len);

}