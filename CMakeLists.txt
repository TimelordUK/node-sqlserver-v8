cmake_minimum_required(VERSION 3.14)
project(msnodesqlv8 CXX)

# Set C++ standard
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Detect OS and architecture
if(WIN32)
    set(OS "win")
    execute_process(COMMAND echo %PROCESSOR_ARCHITECTURE% OUTPUT_VARIABLE ARCH OUTPUT_STRIP_TRAILING_WHITESPACE)
elseif(APPLE)
    set(OS "mac")
    execute_process(COMMAND uname -m OUTPUT_VARIABLE ARCH OUTPUT_STRIP_TRAILING_WHITESPACE)
else()
    set(OS "linux")
    execute_process(COMMAND uname -m OUTPUT_VARIABLE ARCH OUTPUT_STRIP_TRAILING_WHITESPACE)
endif()

# OS-specific compiler flags
if(WIN32)
    set(CFLAGS_CPP "/std:c++20")
    # MSVC compiler options
    add_compile_options(/EHsc)  # Exception handling
elseif(APPLE)
    set(CFLAGS_CPP "gnu++20")
else()
    set(CFLAGS_CPP "-std=c++20 -fexceptions")
endif()

# Global define flags
add_definitions(-DNODE_GYP_V4 -DNAPI_DISABLE_CPP_EXCEPTIONS -DBOUNDDATUM_USE_NODE_API)

# Node.js version check (simulated for CMake)
# For a real implementation, you might want to use a custom CMake script to get Node version
set(NODE_VERSION "14.0.0")  # This is a placeholder, adjust as needed
if(NODE_VERSION VERSION_LESS "13.0.0")
    add_definitions(-DPRE_V13)
endif()

# Platform-specific settings
if(WIN32)
    # Windows-specific settings
    add_definitions(-DWINDOWS_BUILD -DUNICODE=1)
    set(ODBC_LIBRARIES odbc32)
else()
    # Linux/Mac settings
    add_definitions(-DLINUX_BUILD -DUNICODE)
    
    # Find ODBC libraries
    find_package(ODBC REQUIRED)
    
    if(APPLE)
        # Mac-specific include directories
        include_directories(
            /opt/homebrew/include
            /usr/local/include
        )
        
        # Add the homebrew and other paths for linking
        link_directories(
            /opt/homebrew/lib
            /usr/local/lib
            /usr/local/ssl/lib64
        )
    else()
        # Linux-specific include directories
        include_directories(
            /usr/include
        )
        
        # Add Linux specific link directories
        link_directories(
            /usr/local/lib
            /usr/lib
            /usr/lib64
            /home/linuxbrew/.linuxbrew/lib
        )
    endif()
    
    # System libraries for Linux/Mac
    set(SYSTEM_LIBRARIES pthread dl)
    if(NOT APPLE)
        list(APPEND SYSTEM_LIBRARIES rt)
    endif()
endif()

# Microsoft ODBC driver include paths
# Note: In CMake we cannot easily query which drivers are installed like in node-gyp
# So we list potential paths and use them if they exist
set(MSODBC_INCLUDE_PATHS
    /opt/microsoft/msodbcsql18/include
    /opt/microsoft/msodbcsql17/include
    /usr/local/opt/msodbcsql18/include
    /usr/local/opt/msodbcsql17/include
    /usr/local/opt/msodbcsql18/include/msodbcsql18
    /usr/local/opt/msodbcsql17/include/msodbcsql17
    /opt/homebrew/include/msodbcsql18
    /opt/homebrew/include/msodbcsql17
    /home/linuxbrew/.linuxbrew/include
)

# Add existing MSODBC include paths
foreach(INCLUDE_PATH ${MSODBC_INCLUDE_PATHS})
    if(EXISTS ${INCLUDE_PATH})
        include_directories(${INCLUDE_PATH})
    endif()
endforeach()

# Base include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/cpp
    ${CMAKE_SOURCE_DIR}/cpp/include
    ${CMAKE_SOURCE_DIR}/cpp/include/common
    ${CMAKE_SOURCE_DIR}/cpp/include/core
    ${CMAKE_SOURCE_DIR}/cpp/include/js
    ${CMAKE_SOURCE_DIR}/cpp/include/odbc
    ${CMAKE_SOURCE_DIR}/cpp/include/utils
)

# Find Node.js headers
execute_process(
    COMMAND node --version
    OUTPUT_VARIABLE NODE_VERSION
    OUTPUT_STRIP_TRAILING_WHITESPACE
)
# Remove the 'v' prefix from version number
string(REGEX REPLACE "^v" "" NODE_VERSION "${NODE_VERSION}")

message(STATUS "Detected Node.js version: ${NODE_VERSION}")

# Set Node.js headers directory based on platform
if(WIN32)
    set(NODE_HEADERS_DIR "$ENV{USERPROFILE}/AppData/Local/node-gyp/Cache/${NODE_VERSION}")
else()
    # Linux/macOS location
    set(NODE_HEADERS_DIR "$ENV{HOME}/.cache/node-gyp/${NODE_VERSION}")
endif()

if(NOT EXISTS "${NODE_HEADERS_DIR}")
    message(FATAL_ERROR "Node.js headers not found at ${NODE_HEADERS_DIR}. Please ensure node-gyp has downloaded them.")
endif()

message(STATUS "Using Node.js headers from: ${NODE_HEADERS_DIR}")

# Find node-addon-api
set(NODE_ADDON_API_DIR "${CMAKE_SOURCE_DIR}/node_modules/node-addon-api")

# Verify the directory exists
if(NOT EXISTS "${NODE_ADDON_API_DIR}")
    message(FATAL_ERROR "node-addon-api not found at ${NODE_ADDON_API_DIR}. Make sure you have run 'npm install'.")
endif()

message(STATUS "Using node-addon-api from: ${NODE_ADDON_API_DIR}")

# Add Node.js include directories
include_directories(
    "${NODE_HEADERS_DIR}/include/node"
    "${NODE_HEADERS_DIR}/src"
    "${NODE_HEADERS_DIR}/deps/openssl/config"
    "${NODE_HEADERS_DIR}/deps/openssl/openssl/include"
    "${NODE_HEADERS_DIR}/deps/uv/include"
    "${NODE_HEADERS_DIR}/deps/zlib"
    "${NODE_HEADERS_DIR}/deps/v8/include"
    "${NODE_ADDON_API_DIR}"
)

# Source files
file(GLOB_RECURSE COMMON_SOURCES "cpp/src/common/*.cpp")
file(GLOB_RECURSE CORE_SOURCES "cpp/src/core/*.cpp")
file(GLOB_RECURSE JS_SOURCES "cpp/src/js/*.cpp")
file(GLOB_RECURSE ODBC_SOURCES "cpp/src/odbc/*.cpp")
file(GLOB_RECURSE UTILS_SOURCES "cpp/src/utils/*.cpp")

# Main target
add_library(sqlserver MODULE
    cpp/binding.cpp
    ${COMMON_SOURCES}
    ${CORE_SOURCES}
    ${JS_SOURCES}
    ${ODBC_SOURCES}
    ${UTILS_SOURCES}
)

# Link libraries
if(WIN32)
    target_link_libraries(sqlserver ${ODBC_LIBRARIES})
else()
    if(APPLE)
        target_link_libraries(sqlserver ${ODBC_LIBRARIES} ${SYSTEM_LIBRARIES})
    else()
        target_link_libraries(sqlserver odbc ${SYSTEM_LIBRARIES})
    endif()
endif()

# Set output name based on platform
set_target_properties(sqlserver PROPERTIES
    OUTPUT_NAME "sqlserver"
    PREFIX ""
    SUFFIX ".node"
)

# Debug output - similar to the print_variables action in binding.gyp
message(STATUS "C++ flags: ${CFLAGS_CPP}")
message(STATUS "Architecture: ${ARCH}")
message(STATUS "OS: ${OS}")

# Generate a compilation database for IDE support (compile_commands.json)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)