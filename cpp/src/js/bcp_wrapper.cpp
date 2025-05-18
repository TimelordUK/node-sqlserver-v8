#include "js/bcp_wrapper.h"
#include "core/datum_storage.h"
#include <sstream>
#include <cstring>

namespace mssql {

Napi::FunctionReference BcpWrapper::constructor;

Napi::Object BcpWrapper::Init(Napi::Env env, Napi::Object exports) {
    Napi::Function func = DefineClass(env, "BcpWrapper", {
        InstanceMethod("init", &BcpWrapper::init),
        InstanceMethod("bindColumn", &BcpWrapper::bindColumn),  
        InstanceMethod("execute", &BcpWrapper::execute),
        InstanceMethod("getRowCount", &BcpWrapper::getRowCount)
    });
    
    constructor = Napi::Persistent(func);
    constructor.SuppressDestruct();
    
    exports.Set("BcpWrapper", func);
    return exports;
}

BcpWrapper::BcpWrapper(const Napi::CallbackInfo& info) 
    : Napi::ObjectWrap<BcpWrapper>(info) {
    
    Napi::Env env = info.Env();
    
    if (info.Length() != 1) {
        Napi::TypeError::New(env, "BcpWrapper requires executor").ThrowAsJavaScriptException();
        return;
    }
    
    // The executor is passed as external data
    auto external = info[0].As<Napi::External<BcpExecutor>>();
    executor = std::shared_ptr<BcpExecutor>(external.Data(), [](BcpExecutor*){});
}

Napi::Value BcpWrapper::init(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 1 || !info[0].IsString()) {
        Napi::TypeError::New(env, "Table name string required").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    std::string table_name = info[0].As<Napi::String>().Utf8Value();
    std::vector<std::string> columns;
    
    // Optional columns array
    if (info.Length() >= 2 && info[1].IsArray()) {
        Napi::Array arr = info[1].As<Napi::Array>();
        for (uint32_t i = 0; i < arr.Length(); i++) {
            if (arr.Get(i).IsString()) {
                columns.push_back(arr.Get(i).As<Napi::String>().Utf8Value());
            }
        }
    }
    
    bool success = executor->init(table_name, columns);
    return Napi::Boolean::New(env, success);
}

Napi::Value BcpWrapper::bindColumn(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    if (info.Length() < 5) {
        Napi::TypeError::New(env, "bindColumn requires 5 parameters").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    int column_num = info[0].As<Napi::Number>().Int32Value();
    
    // Extract data from JavaScript object
    Napi::Object dataObj = info[1].As<Napi::Object>();
    
    if (!dataObj.Has("values") || !dataObj.Get("values").IsArray()) {
        Napi::TypeError::New(env, "Data object must have 'values' array").ThrowAsJavaScriptException();
        return env.Null();
    }
    
    Napi::Array valuesArr = dataObj.Get("values").As<Napi::Array>();
    Napi::Array indicators = info[2].As<Napi::Array>();
    
    // Convert JavaScript array to vector
    std::vector<SQLLEN> ind_vec;
    for (uint32_t i = 0; i < indicators.Length(); i++) {
        ind_vec.push_back(indicators.Get(i).As<Napi::Number>().Int64Value());
    }
    
    int sql_type = info[3].As<Napi::Number>().Int32Value();
    size_t buffer_len = info[4].As<Napi::Number>().Uint32Value();
    
    // Create appropriate storage based on SQL type
    std::shared_ptr<DatumStorage> storage = std::make_shared<DatumStorage>();
    
    // Set the SQL type
    DatumStorage::SqlType sqlTypeEnum;
    switch (sql_type) {
        case SQL_INTEGER:
            sqlTypeEnum = DatumStorage::SqlType::Integer;
            break;
        case SQL_SMALLINT:
            sqlTypeEnum = DatumStorage::SqlType::SmallInt;
            break;
        case SQL_FLOAT:
        case SQL_DOUBLE:
            sqlTypeEnum = DatumStorage::SqlType::Double;
            break;
        case SQL_REAL:
            sqlTypeEnum = DatumStorage::SqlType::Real;
            break;
        case SQL_CHAR:
        case SQL_VARCHAR:
        case SQL_LONGVARCHAR:
            sqlTypeEnum = DatumStorage::SqlType::VarChar;
            break;
        case SQL_WCHAR:
        case SQL_WVARCHAR:
        case SQL_WLONGVARCHAR:
            sqlTypeEnum = DatumStorage::SqlType::NVarChar;
            break;
        case SQL_TYPE_DATE:
            sqlTypeEnum = DatumStorage::SqlType::Date;
            break;
        case SQL_TYPE_TIME:
            sqlTypeEnum = DatumStorage::SqlType::Time;
            break;
        case SQL_TYPE_TIMESTAMP:
            sqlTypeEnum = DatumStorage::SqlType::DateTime;
            break;
        default:
            Napi::TypeError::New(env, "Unsupported SQL type").ThrowAsJavaScriptException();
            return env.Null();
    }
    
    storage->setType(sqlTypeEnum);
    
    // Reserve space for our data
    storage->reserve(valuesArr.Length());
    
    // Force creation of the underlying vector by calling getStorage
    auto storagePtr = storage->getStorage();
    
    // Add values to storage
    for (uint32_t i = 0; i < valuesArr.Length(); i++) {
        if (ind_vec[i] == SQL_NULL_DATA) {
            storage->setNull(true);
        } else {
            storage->setNull(false);
            
            switch (sql_type) {
                case SQL_INTEGER:
                {
                    try {
                        int32_t val = valuesArr.Get(i).As<Napi::Number>().Int32Value();
                        // Get the underlying int32_t vector and add to it
                        auto vec = storage->getTypedVector<int32_t>();
                        vec->push_back(val);
                    } catch (const std::exception& e) {
                        Napi::Error::New(env, std::string("Failed to add value: ") + e.what()).ThrowAsJavaScriptException();
                        return env.Null();
                    }
                    break;
                }
                case SQL_SMALLINT:
                {
                    int16_t val = valuesArr.Get(i).As<Napi::Number>().Int32Value();
                    auto vec = storage->getTypedVector<int16_t>();
                    vec->push_back(val);
                    break;
                }
                case SQL_FLOAT:
                case SQL_DOUBLE:
                case SQL_REAL:
                {
                    double val = valuesArr.Get(i).As<Napi::Number>().DoubleValue();
                    auto vec = storage->getTypedVector<double>();
                    vec->push_back(val);
                    break;
                }
                    
                case SQL_CHAR:
                case SQL_VARCHAR:
                case SQL_LONGVARCHAR:
                {
                    std::string str = valuesArr.Get(i).As<Napi::String>().Utf8Value();
                    std::vector<char> charVec(str.begin(), str.end());
                    charVec.push_back('\0'); // null terminate
                    auto sharedVec = std::make_shared<std::vector<char>>(std::move(charVec));
                    storage->addValue(sharedVec);
                    break;
                }
                    
                case SQL_WCHAR:
                case SQL_WVARCHAR:
                case SQL_WLONGVARCHAR:
                {
                    std::string str = valuesArr.Get(i).As<Napi::String>().Utf8Value();
                    std::vector<uint16_t> utf16;
                    for (char c : str) {
                        utf16.push_back(static_cast<uint16_t>(c));
                    }
                    utf16.push_back(0); // null terminate
                    auto sharedVec = std::make_shared<std::vector<uint16_t>>(std::move(utf16));
                    storage->addValue(sharedVec);
                    break;
                }
                    
                case SQL_TYPE_DATE:
                {
                    if (valuesArr.Get(i).IsDate()) {
                        auto date = valuesArr.Get(i).As<Napi::Date>();
                        int64_t timestamp = static_cast<int64_t>(date.ValueOf());
                        
                        // Convert JavaScript timestamp to SQL_DATE_STRUCT
                        SQL_DATE_STRUCT dateStruct;
                        std::time_t time = timestamp / 1000;
                        std::tm* tm = std::gmtime(&time);
                        dateStruct.year = tm->tm_year + 1900;
                        dateStruct.month = tm->tm_mon + 1;
                        dateStruct.day = tm->tm_mday;
                        
                        storage->addValue(dateStruct);
                    }
                    break;
                }
                    
                case SQL_TYPE_TIME:
                {
                    if (valuesArr.Get(i).IsDate()) {
                        auto date = valuesArr.Get(i).As<Napi::Date>();
                        int64_t timestamp = static_cast<int64_t>(date.ValueOf());
                        
                        // Convert JavaScript timestamp to SQL_SS_TIME2_STRUCT
                        SQL_SS_TIME2_STRUCT timeStruct;
                        std::time_t time = timestamp / 1000;
                        std::tm* tm = std::gmtime(&time);
                        timeStruct.hour = tm->tm_hour;
                        timeStruct.minute = tm->tm_min;
                        timeStruct.second = tm->tm_sec;
                        timeStruct.fraction = (timestamp % 1000) * 1000000; // Convert ms to ns
                        
                        storage->addValue(timeStruct);
                    }
                    break;
                }
                    
                case SQL_TYPE_TIMESTAMP:
                {
                    if (valuesArr.Get(i).IsDate()) {
                        auto date = valuesArr.Get(i).As<Napi::Date>();
                        int64_t timestamp = static_cast<int64_t>(date.ValueOf());
                        
                        // Convert JavaScript timestamp to SQL_TIMESTAMP_STRUCT
                        SQL_TIMESTAMP_STRUCT timestampStruct;
                        std::time_t time = timestamp / 1000;
                        std::tm* tm = std::gmtime(&time);
                        timestampStruct.year = tm->tm_year + 1900;
                        timestampStruct.month = tm->tm_mon + 1;
                        timestampStruct.day = tm->tm_mday;
                        timestampStruct.hour = tm->tm_hour;
                        timestampStruct.minute = tm->tm_min;
                        timestampStruct.second = tm->tm_sec;
                        timestampStruct.fraction = (timestamp % 1000) * 1000000; // Convert ms to ns
                        
                        storage->addValue(timestampStruct);
                    }
                    break;
                }
            }
        }
    }
    
    bool success = executor->bindColumn(column_num, storage, ind_vec, sql_type, buffer_len);
    return Napi::Boolean::New(env, success);
}

Napi::Value BcpWrapper::execute(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    
    auto result = executor->execute();
    
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("success", Napi::Boolean::New(env, result.first));
    obj.Set("message", Napi::String::New(env, result.second));
    
    return obj;
}

Napi::Value BcpWrapper::getRowCount(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    return Napi::Number::New(env, executor->getRowCount());
}

Napi::Object BcpWrapper::NewInstance(Napi::Env env, std::shared_ptr<BcpExecutor> exec) {
    Napi::EscapableHandleScope scope(env);
    
    Napi::External<BcpExecutor> external = Napi::External<BcpExecutor>::New(env, exec.get());
    Napi::Object instance = constructor.New({ external });
    
    return scope.Escape(instance).ToObject();
}

}