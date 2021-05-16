//---------------------------------------------------------------------------------------------------------------------------------
// File: stdafx.h
// Contents: Precompiled header
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

#pragma once

#ifdef LINUX_BUILD
#define GCC_VERSION (__GNUC__ * 10000 \
                     + __GNUC_MINOR__ * 100 \
                     + __GNUC_PATCHLEVEL__)
    #if GCC_VERSION > 90200
    #pragma GCC diagnostic ignored "-Wcast-function-type"
    #endif
#endif

#include <v8.h>
#include <uv.h>
#include <node.h>
#include <node_buffer.h>
#include <nan.h>
#ifdef LINUX_BUILD
    #include <sqltypes.h>
    #include <sqlspi.h>
    #include <sqlext.h>
    #include <sql.h>
    #include <msodbcsql.h>
    #include <sqlncli-linux.h>
#endif

#include <sqlucode.h>

#ifdef WINDOWS_BUILD
    #include <windows.h>	// for critical section until xplatform
#endif

#include <vector>
#include <queue>
#include <string>
#include <functional>
#include <algorithm>
#include <numeric>
#include <memory>

#include "Utility.h"
#include "OdbcError.h"
#include "OdbcHandle.h"

// #define interface struct 	// for the COM interfaces in sqlncli.h and to avoid including extra files

#ifdef WINDOWS_BUILD
    #include "sqlncli.h"	 	// SQL Server specific constants
#endif



// default values filled in for a JS date object when retrieving a SQL Server time field
// There is no default JS date when only a time is furnished, so we are using the SQL Server
// defaults, which is Jan 1, 1900.
const int SQL_SERVER_DEFAULT_YEAR  = 1900;
const int SQL_SERVER_DEFAULT_MONTH = 1;		// JS months are 0 based, SQL Server months are 1 based
const int SQL_SERVER_DEFAULT_DAY   = 1;

#define ErrorIf(x) if (x) goto Error;
