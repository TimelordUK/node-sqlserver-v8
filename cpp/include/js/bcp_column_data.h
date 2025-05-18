#pragma once

#include <vector>
#include <memory>
#include <sql.h>
#include <sqlext.h>

namespace mssql {
    
    // Simple data holder for BCP column data
    class BcpColumnData {
    public:
        enum Type {
            INT32,
            INT16,
            DOUBLE,
            STRING,
            WSTRING
        };
        
        Type type;
        std::vector<SQLLEN> indicators;
        
        // Data vectors
        std::shared_ptr<std::vector<int32_t>> int32Data;
        std::shared_ptr<std::vector<int16_t>> int16Data;
        std::shared_ptr<std::vector<double>> doubleData;
        std::shared_ptr<std::vector<std::string>> stringData;
        std::shared_ptr<std::vector<std::u16string>> wstringData;
        
        BcpColumnData(Type t, size_t count) : type(t) {
            indicators.resize(count);
            
            switch (type) {
                case INT32:
                    int32Data = std::make_shared<std::vector<int32_t>>();
                    int32Data->reserve(count);
                    break;
                case INT16:
                    int16Data = std::make_shared<std::vector<int16_t>>();
                    int16Data->reserve(count);
                    break;
                case DOUBLE:
                    doubleData = std::make_shared<std::vector<double>>();
                    doubleData->reserve(count);
                    break;
                case STRING:
                    stringData = std::make_shared<std::vector<std::string>>();
                    stringData->reserve(count);
                    break;
                case WSTRING:
                    wstringData = std::make_shared<std::vector<std::u16string>>();
                    wstringData->reserve(count);
                    break;
            }
        }
        
        size_t size() const {
            switch (type) {
                case INT32: return int32Data ? int32Data->size() : 0;
                case INT16: return int16Data ? int16Data->size() : 0;
                case DOUBLE: return doubleData ? doubleData->size() : 0;
                case STRING: return stringData ? stringData->size() : 0;
                case WSTRING: return wstringData ? wstringData->size() : 0;
            }
            return 0;
        }
    };

}