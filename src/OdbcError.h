//--------------------------------------------------------------------------------------------------------------------------------
// File: OdbcError.h
// Contents: Object that represents ODBC errors
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
//--------------------------------------------------------------------------------------------------------------------------------

#pragma once

namespace mssql
{
    using namespace std;

    class OdbcError
    {
    public:

        OdbcError( const char* sqlstate, const char* message, SQLINTEGER code, 
                    const int severity, const char* serverName, const char* procName, const unsigned int lineNumber 
        )
           : sqlstate( sqlstate ), message(message), code(code), 
                severity(severity), serverName(serverName), procName(procName), lineNumber(lineNumber)
        {
        }

        const char* Message( void ) const
        {
            return message.c_str();
        }

        const char* SqlState( void ) const
        {
            return sqlstate.c_str();
        }

        SQLINTEGER Code( void ) const
        {
            return code;
        }
        
        int Severity( void ) const
        {
            return severity;
        }

        const char* ServerName( void ) const
        {
            return serverName.c_str();
        }

        const char* ProcName( void ) const
        {
            return procName.c_str();
        }

        unsigned int LineNumber( void ) const
        {
            return lineNumber;
        }

        // list of msnodesql specific errors
        static OdbcError NODE_SQL_NO_DATA;

    private:
        string sqlstate;
        string message; 
        SQLINTEGER code;
        int severity;
        string serverName;
        string procName;
        unsigned int lineNumber;
    };

}
