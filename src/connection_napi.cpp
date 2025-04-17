//---------------------------------------------------------------------------------------------------------------------------------
// File: Connection_napi.cpp
// Contents: C++ interface to Microsoft Driver for Node.js for SQL Server (Node-API version)
//
// Copyright Microsoft Corporation and contributors
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
//
// You may obtain a copy of the License at:
// http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//---------------------------------------------------------------------------------------------------------------------------------

#ifdef CONNECTION_USE_NODE_API

#include "stdafx.h"
#include <Connection.h>
#include <OdbcConnection.h>
#include <MutateJS.h>

namespace mssql
{
    // Initialize static constructor reference
    Napi::FunctionReference Connection::constructor;

    // Connection constructor
    Connection::Connection(const Napi::CallbackInfo& info)
        : Napi::ObjectWrap<Connection>(info), connectionBridge(make_unique<OdbcConnectionBridge>())
    {
    }

    // Destructor
    Connection::~Connection()
    {
        // close the connection now since the object is being collected
        // connectionBridge->Collect();
    }

    // Initialize the class and export it
    Napi::Object Connection::Init(Napi::Env env, Napi::Object exports) {
        // Initialize ODBC environment
        const auto initialized = OdbcConnection::InitializeEnvironment();

        if (!initialized) {
            // Set null property if initialization fails
            exports.Set("Connection", env.Null());
            Napi::Error::New(env, "Unable to initialize msnodesql").ThrowAsJavaScriptException();
            return exports;
        }

        // Define class constructor
        Napi::Function func = DefineClass(env, "Connection", {
            InstanceMethod("close", &Connection::close),
            InstanceMethod("open", &Connection::open),
            InstanceMethod("query", &Connection::query),
            InstanceMethod("bindQuery", &Connection::bind_query),
            InstanceMethod("prepare", &Connection::prepare),
            InstanceMethod("readColumn", &Connection::read_column),
            InstanceMethod("beginTransaction", &Connection::begin_transaction),
            InstanceMethod("commit", &Connection::commit),
            InstanceMethod("rollback", &Connection::rollback),
            InstanceMethod("nextResult", &Connection::read_next_result),
            InstanceMethod("callProcedure", &Connection::call_procedure),
            InstanceMethod("unbind", &Connection::unbind),
            InstanceMethod("freeStatement", &Connection::free_statement),
            InstanceMethod("cancelQuery", &Connection::cancel_statement),
            InstanceMethod("pollingMode", &Connection::polling_mode),
        });

        // Create persistent reference to constructor
        constructor = Napi::Persistent(func);
        constructor.SuppressDestruct();

        // Export the class
        exports.Set("Connection", func);
        return exports;
    }

    // Connection::close method
    Napi::Value Connection::close(const Napi::CallbackInfo& info) {
        const auto cb = info[0].As<Napi::Object>();
        const auto ret = connectionBridge->close(cb);
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::begin_transaction method
    Napi::Value Connection::begin_transaction(const Napi::CallbackInfo& info) {
        const auto cb = info[0].As<Napi::Object>();
        const auto ret = connectionBridge->begin_transaction(cb);
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::commit method
    Napi::Value Connection::commit(const Napi::CallbackInfo& info) {
        const auto cb = info[0].As<Napi::Object>();
        const auto ret = connectionBridge->commit(cb);
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::rollback method
    Napi::Value Connection::rollback(const Napi::CallbackInfo& info) {
        const auto cb = info[0].As<Napi::Object>();
        const auto ret = connectionBridge->rollback(cb);
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::query method
    Napi::Value Connection::query(const Napi::CallbackInfo& info) {
        const auto query_id = info[0].As<Napi::Number>();
        const auto query_object = info[1].As<Napi::Object>();
        const auto params = info[2].As<Napi::Array>();
        const auto callback = info[3].As<Napi::Object>();

        const auto ret = connectionBridge->query(query_id, query_object, params, callback);
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::prepare method
    Napi::Value Connection::prepare(const Napi::CallbackInfo& info) {
        const auto query_id = info[0].As<Napi::Number>();
        const auto query_object = info[1].As<Napi::Object>();
        const auto callback = info[2].As<Napi::Object>();

        const auto ret = connectionBridge->prepare(query_id, query_object, callback);
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::bind_query method
    Napi::Value Connection::bind_query(const Napi::CallbackInfo& info) {
        const auto query_id = info[0].As<Napi::Number>();
        const auto params = info[1].As<Napi::Array>();
        const auto callback = info[2].As<Napi::Object>();

        const auto ret = connectionBridge->query_prepared(query_id, params, callback);
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::call_procedure method
    Napi::Value Connection::call_procedure(const Napi::CallbackInfo& info) {
        // need to ensure the signature is changed (in js ?) to form (?) = call sproc (?, ? ... );
        const auto query_id = info[0].As<Napi::Number>();
        const auto query_object = info[1].As<Napi::Object>();
        const auto params = info[2].As<Napi::Array>();
        const auto callback = info[3].As<Napi::Object>();

        const auto ret = connectionBridge->call_procedure(query_id, query_object, params, callback);
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::unbind method
    Napi::Value Connection::unbind(const Napi::CallbackInfo& info) {
        const auto query_id = info[0].As<Napi::Number>();
        const auto callback = info[1].As<Napi::Object>();
        const auto ret = connectionBridge->unbind_parameters(query_id, callback);
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::free_statement method
    Napi::Value Connection::free_statement(const Napi::CallbackInfo& info) {
        const auto query_id = info[0].As<Napi::Number>();
        const auto callback = info[1].As<Napi::Object>();
        const auto ret = connectionBridge->free_statement(query_id, callback);
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::read_column method
    Napi::Value Connection::read_column(const Napi::CallbackInfo& info) {
        const auto query_id = info[0].As<Napi::Number>();
        const auto number_rows = info[1].As<Napi::Number>();
        const auto cb = info[2].As<Napi::Object>();
        const auto ret = connectionBridge->read_column(query_id, number_rows, cb);
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::read_next_result method
    Napi::Value Connection::read_next_result(const Napi::CallbackInfo& info) {
        const auto query_id = info[0].As<Napi::Number>();
        const auto callback = info[1].As<Napi::Object>();
        const auto ret = connectionBridge->read_next_result(query_id, callback);
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::open method
    Napi::Value Connection::open(const Napi::CallbackInfo& info) {
        const auto connection_object = info[0].As<Napi::Object>();
        const auto callback = info[1].As<Napi::Object>();

        const auto ret = connectionBridge->open(connection_object, callback, info.This());
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::cancel_statement method
    Napi::Value Connection::cancel_statement(const Napi::CallbackInfo& info) {
        const auto query_id = info[0].As<Napi::Number>();
        const auto callback = info[1].As<Napi::Object>();
        const auto ret = connectionBridge->cancel(query_id, callback);
        return Napi::Boolean::New(info.Env(), ret);
    }

    // Connection::read_row method - this appears to be declared but not implemented in your original code
    Napi::Value Connection::read_row(const Napi::CallbackInfo& info) {
        // Implement as needed
        return info.Env().Undefined();
    }

    // Connection::polling_mode method
    Napi::Value Connection::polling_mode(const Napi::CallbackInfo& info) {
        const auto query_id = info[0].As<Napi::Number>();
        const auto v1 = info[1].ToBoolean();
        const auto callback = info[2].As<Napi::Object>();

        const auto b1 = Napi::Boolean::New(info.Env(), v1.Value());
        const auto ret = connectionBridge->polling_mode(query_id, b1, callback);
        return Napi::Boolean::New(info.Env(), ret);
    }
}

#endif // CONNECTION_USE_NODE_API