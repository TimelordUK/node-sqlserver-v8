#include "core/query_result.h"
#include <thread>
#include <chrono>

namespace mssql {

// Napi::Object mssql::QueryResult::toJSObject(Napi::Env env)
//{
//     Napi::Object result = Napi::Object::New(env);

//    // Create metadata object
//    Napi::Array meta = Napi::Array::New(env, columns_.size());
//    for (size_t i = 0; i < columns_.size(); i++)
//    {
//        Napi::Object colInfo = Napi::Object::New(env);
//        colInfo.Set("name", Napi::String::New(env, columns_[i].name));
//        colInfo.Set("sqlType", Napi::Number::New(env, columns_[i].sqlType));
//        meta[i] = colInfo;
//    }
//    result.Set("meta", meta);

//    // Create rows array
//    Napi::Array rowsArray = Napi::Array::New(env, rows_.size());
//    for (size_t i = 0; i < rows_.size(); i++)
//    {
//        Napi::Array row = Napi::Array::New(env, rows_[i].size());
//        for (size_t j = 0; j < rows_[i].size(); j++)
//        {
//            row[j] = Napi::String::New(env, rows_[i][j]);
//        }
//        rowsArray[i] = row;
//    }
//    result.Set("rows", rowsArray);

//    return result;
//}

}  // namespace mssql