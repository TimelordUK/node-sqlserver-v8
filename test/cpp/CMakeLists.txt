cmake_minimum_required(VERSION 3.14)
project(msnodesqlv8_tests CXX)

# Set C++ standard (match node-gyp)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Platform-specific settings
if(WIN32)
    add_compile_definitions(NOMINMAX)
    # Windows settings (as you already have)
    # ...
else()
    # Linux/Mac settings
    add_definitions(-DLINUX_BUILD -DUNICODE -DBUILDING_NODE_EXTENSION -DNAPI_DISABLE_CPP_EXCEPTIONS)
    
    # Add C++20 flag (we'll keep it since your node-gyp is also using C++20)
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} -std=c++20 -fexceptions")
    
    # Linux/Mac use -lodbc
    find_library(ODBC_LIBRARIES NAMES odbc)
    if(NOT ODBC_LIBRARIES)
        message(FATAL_ERROR "ODBC library not found. Please install unixODBC development package.")
    endif()
endif()

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
    # Linux location (from your node-gyp output)
    set(NODE_HEADERS_DIR "$ENV{HOME}/.cache/node-gyp/${NODE_VERSION}")
endif()

if(NOT EXISTS "${NODE_HEADERS_DIR}")
    message(FATAL_ERROR "Node.js headers not found at ${NODE_HEADERS_DIR}. Please ensure node-gyp has downloaded them.")
endif()

message(STATUS "Using Node.js headers from: ${NODE_HEADERS_DIR}")

# Find node-addon-api - use relative path from test/cpp to project root
set(NODE_ADDON_API_DIR "${CMAKE_CURRENT_SOURCE_DIR}/../../node_modules/node-addon-api")

# Verify the directory exists
if(NOT EXISTS "${NODE_ADDON_API_DIR}")
    message(FATAL_ERROR "node-addon-api not found at ${NODE_ADDON_API_DIR}. Make sure you have run 'npm install'.")
endif()

message(STATUS "Using node-addon-api from: ${NODE_ADDON_API_DIR}")

# Set up Node.js library paths (Windows-specific)
if(WIN32)
    # Existing Windows library setup
    # ...
endif()

# Set up Google Test
include(FetchContent)
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG release-1.12.1
)
# For Windows, prevent overriding the parent project's compiler/linker settings
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

# Get all source files except module.cpp
file(GLOB_RECURSE SOURCE_FILES 
    "../../src/*.cpp"
)
list(FILTER SOURCE_FILES EXCLUDE REGEX ".*module\\.cpp$")

# Setup test source files
set(TEST_SOURCE_FILES
    parameter_test.cpp
    datum_storage_test.cpp
    time_util_tests.cpp
    js_time_adapter_tests.cpp
    test_main.cpp
    mock_napi.cpp
    # Add other test files here as needed
)

# Add required include directories
include_directories(
    "${NODE_HEADERS_DIR}/include/node"
    "${NODE_HEADERS_DIR}/src"
    "${NODE_HEADERS_DIR}/deps/openssl/config"
    "${NODE_HEADERS_DIR}/deps/openssl/openssl/include"
    "${NODE_HEADERS_DIR}/deps/uv/include"
    "${NODE_HEADERS_DIR}/deps/zlib"
    "${NODE_HEADERS_DIR}/deps/v8/include"
    "${NODE_ADDON_API_DIR}"
    "../../src"
)

# If on Linux, check for Microsoft ODBC Driver for SQL Server
if(NOT WIN32)
    find_path(MSODBC_INCLUDE_DIR
        NAMES msodbcsql.h
        PATHS "/opt/microsoft/msodbcsql18/include/" # From your node-gyp output
              "/opt/microsoft/msodbcsql17/include/"
    )
    if(MSODBC_INCLUDE_DIR)
        include_directories(${MSODBC_INCLUDE_DIR})
        message(STATUS "Found Microsoft ODBC Driver include directory: ${MSODBC_INCLUDE_DIR}")
    else()
        message(WARNING "Microsoft ODBC Driver for SQL Server include directory not found")
    endif()
endif()

# Debug output
message(STATUS "SOURCE_FILES: ${SOURCE_FILES}")
message(STATUS "TEST_SOURCE_FILES: ${TEST_SOURCE_FILES}")
message(STATUS "Current directory: ${CMAKE_CURRENT_SOURCE_DIR}")

# Add test executable
add_executable(cpp_tests ${SOURCE_FILES} ${TEST_SOURCE_FILES})

# Define compilation flags for testing
target_compile_definitions(cpp_tests PRIVATE 
    UNIT_TEST=1
    NAPI_DISABLE_CPP_EXCEPTIONS
)

# Platform-specific settings for Node.js
if(WIN32)
    # Windows-specific linker flags and libraries
    set_target_properties(cpp_tests PROPERTIES LINK_FLAGS "/NODEFAULTLIB:msvcrt.lib")
    
    # Add Node.js library if found
    if(EXISTS "${NODE_LIBRARIES}")
        target_link_libraries(cpp_tests "${NODE_LIBRARIES}")
    endif()
else()
    # Linux needs to link with the Node.js shared library
    
    # Method 1: Try to find node library in standard locations
    find_library(NODE_LIB NAMES node nodejs
                PATHS /usr/lib /usr/local/lib /usr/lib64 /usr/local/lib64
                      ${NODE_HEADERS_DIR}
                      ${NODE_HEADERS_DIR}/out/Release
                      ${NODE_HEADERS_DIR}/out/Debug)
                      
    if(NODE_LIB)
        message(STATUS "Found Node.js library: ${NODE_LIB}")
        target_link_libraries(cpp_tests ${NODE_LIB})
    else()
        message(STATUS "Node.js library not found, trying to mock N-API functions")
        
        # Method 2: Mock the N-API functions
        # Add a define to indicate we're mocking
        add_definitions(-DMOCK_NAPI)
        
      
    endif()

    # Linux might need pthread for GoogleTest
    target_link_libraries(cpp_tests pthread dl)
endif()

# Platform-specific link libraries
if(WIN32)
    # Windows-specific linker flags
    set_target_properties(cpp_tests PROPERTIES LINK_FLAGS "/NODEFAULTLIB:msvcrt.lib")
    
    # Add Node.js library if found
    if(EXISTS "${NODE_LIBRARIES}")
        target_link_libraries(cpp_tests "${NODE_LIBRARIES}")
    endif()
else()
    # Linux might need pthread for GoogleTest
    target_link_libraries(cpp_tests pthread)
endif()

# Common libraries to link
target_link_libraries(cpp_tests
    ${ODBC_LIBRARIES}
    GTest::gtest
    GTest::gtest_main
)

# Enable CTest
include(GoogleTest)
gtest_discover_tests(cpp_tests 
    DISCOVERY_MODE PRE_TEST
    PROPERTIES TIMEOUT 120
)