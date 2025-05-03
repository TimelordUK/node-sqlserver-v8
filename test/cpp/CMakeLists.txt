cmake_minimum_required(VERSION 3.14)
project(msnodesqlv8_tests CXX)

# Set C++ standard (match node-gyp)
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
add_definitions(-DMOCK_NAPI)
add_compile_definitions(MOCK_NAPI)

# Platform-specific settings
if(WIN32)
   # Make sure we're using MSVC
    if(NOT MSVC)
        message(FATAL_ERROR "On Windows, please use the Visual Studio generator (e.g., -G \"Visual Studio 17 2022\")")
    endif()

    # Add MSVC-specific flags
    set(CMAKE_CXX_FLAGS "${CMAKE_CXX_FLAGS} /EHsc /GF /Gm- /GS /Gy /fp:precise /Zc:wchar_t /Zc:forScope /Zc:inline /GR- /FC /std:c++20")
    set(CMAKE_CXX_FLAGS_RELEASE "${CMAKE_CXX_FLAGS_RELEASE} /Ox /Ob2 /Oi /Ot /Oy /GL /MT")
    set(CMAKE_MSVC_RUNTIME_LIBRARY "MultiThreaded$<$<CONFIG:Debug>:Debug>")

    # Add Windows-specific definitions
    add_definitions(
        -DWINDOWS_BUILD
        -DUNICODE=1
        -DBUILDING_NODE_EXTENSION
        -DNOMINMAX
        -D_HAS_EXCEPTIONS=0
        -DNODE_GYP_V4
        -DTESTING_MODE
    )
    # Windows uses odbc32.lib
    set(ODBC_LIBRARIES odbc32)
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

# Set up Node.js library paths
if(WIN32)
    set(NODE_LIBRARIES "${NODE_HEADERS_DIR}/x64/node.lib")
    if(NOT EXISTS "${NODE_LIBRARIES}")
        message(STATUS "Node.js library not found at ${NODE_LIBRARIES}, trying Release directory")
        set(NODE_LIBRARIES "${NODE_HEADERS_DIR}/Release/node.lib")
        if(NOT EXISTS "${NODE_LIBRARIES}")
            message(STATUS "Node.js library not found at ${NODE_LIBRARIES}, trying Debug directory")
            set(NODE_LIBRARIES "${NODE_HEADERS_DIR}/Debug/node.lib")
            if(NOT EXISTS "${NODE_LIBRARIES}")
                message(WARNING "Node.js library not found. Will use mock implementations instead.")
                set(NODE_LIBRARIES "")
            endif()
        endif()
    endif()
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
    "../../cpp/*.cpp"
)
list(FILTER SOURCE_FILES EXCLUDE REGEX ".*module\\.cpp$")

# Enable CTest and test discovery
enable_testing()
include(GoogleTest)

# Create directory structure if not exists
file(MAKE_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/mocks/include)
file(MAKE_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/mocks/src)
file(MAKE_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/helpers/include)
file(MAKE_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/helpers/src)
file(MAKE_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/include)
file(MAKE_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/src)
file(MAKE_DIRECTORY ${CMAKE_CURRENT_SOURCE_DIR}/unit)

# Move existing test files to proper locations if they exist
# Mock header files
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/mock_odbc_api.h")
    file(RENAME 
        "${CMAKE_CURRENT_SOURCE_DIR}/mock_odbc_api.h" 
        "${CMAKE_CURRENT_SOURCE_DIR}/mocks/include/mock_odbc_api.h"
    )
endif()

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/mock_odbc_statement.h")
    file(RENAME 
        "${CMAKE_CURRENT_SOURCE_DIR}/mock_odbc_statement.h" 
        "${CMAKE_CURRENT_SOURCE_DIR}/mocks/include/mock_odbc_statement.h"
    )
endif()

# Mock implementation files
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/mock_odbc_api.cpp")
    file(RENAME 
        "${CMAKE_CURRENT_SOURCE_DIR}/mock_odbc_api.cpp" 
        "${CMAKE_CURRENT_SOURCE_DIR}/mocks/src/mock_odbc_api.cpp"
    )
endif()

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/mock_js_object_mapper.cpp")
    file(RENAME 
        "${CMAKE_CURRENT_SOURCE_DIR}/mock_js_object_mapper.cpp" 
        "${CMAKE_CURRENT_SOURCE_DIR}/mocks/src/mock_js_object_mapper.cpp"
    )
endif()

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/mock_napi.cpp")
    file(RENAME 
        "${CMAKE_CURRENT_SOURCE_DIR}/mock_napi.cpp" 
        "${CMAKE_CURRENT_SOURCE_DIR}/mocks/src/mock_napi.cpp"
    )
endif()

# Test files
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/odbc_statement_test.cpp")
    file(RENAME 
        "${CMAKE_CURRENT_SOURCE_DIR}/odbc_statement_test.cpp" 
        "${CMAKE_CURRENT_SOURCE_DIR}/unit/odbc_statement_test.cpp"
    )
endif()

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/odbc_connection_test.cpp")
    file(RENAME 
        "${CMAKE_CURRENT_SOURCE_DIR}/odbc_connection_test.cpp" 
        "${CMAKE_CURRENT_SOURCE_DIR}/unit/odbc_connection_test.cpp"
    )
endif()

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/time_util_tests.cpp")
    file(RENAME 
        "${CMAKE_CURRENT_SOURCE_DIR}/time_util_tests.cpp" 
        "${CMAKE_CURRENT_SOURCE_DIR}/unit/time_util_tests.cpp"
    )
endif()

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/datum_storage_test.cpp")
    file(RENAME 
        "${CMAKE_CURRENT_SOURCE_DIR}/datum_storage_test.cpp" 
        "${CMAKE_CURRENT_SOURCE_DIR}/unit/datum_storage_test.cpp"
    )
endif()

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/object_properties_test.cpp")
    file(RENAME 
        "${CMAKE_CURRENT_SOURCE_DIR}/object_properties_test.cpp" 
        "${CMAKE_CURRENT_SOURCE_DIR}/unit/object_properties_test.cpp"
    )
endif()

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/js_time_adapter_tests.cpp")
    file(RENAME 
        "${CMAKE_CURRENT_SOURCE_DIR}/js_time_adapter_tests.cpp" 
        "${CMAKE_CURRENT_SOURCE_DIR}/unit/js_time_adapter_tests.cpp"
    )
endif()

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/create_parameter_object.cpp")
    file(RENAME 
        "${CMAKE_CURRENT_SOURCE_DIR}/create_parameter_object.cpp" 
        "${CMAKE_CURRENT_SOURCE_DIR}/unit/create_parameter_object.cpp"
    )
endif()

if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/parameter_test.cpp")
    file(RENAME 
        "${CMAKE_CURRENT_SOURCE_DIR}/parameter_test.cpp" 
        "${CMAKE_CURRENT_SOURCE_DIR}/unit/parameter_test.cpp"
    )
endif()

# Find all files in the new directory structure
file(GLOB_RECURSE MOCK_HEADERS "${CMAKE_CURRENT_SOURCE_DIR}/mocks/include/*.h")
file(GLOB_RECURSE MOCK_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/mocks/src/*.cpp")
file(GLOB_RECURSE HELPER_HEADERS "${CMAKE_CURRENT_SOURCE_DIR}/helpers/include/*.h")
file(GLOB_RECURSE HELPER_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/helpers/src/*.cpp")
file(GLOB_RECURSE FIXTURE_HEADERS "${CMAKE_CURRENT_SOURCE_DIR}/fixtures/include/*.h")
file(GLOB_RECURSE FIXTURE_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/fixtures/src/*.cpp")
file(GLOB_RECURSE TEST_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/unit/*.cpp")

# Add the test_main.cpp if not moved
if(EXISTS "${CMAKE_CURRENT_SOURCE_DIR}/test_main.cpp")
    list(APPEND TEST_SOURCES "${CMAKE_CURRENT_SOURCE_DIR}/test_main.cpp")
endif()

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
    "../../cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/mocks/include"
    "${CMAKE_CURRENT_SOURCE_DIR}/helpers/include"
    "${CMAKE_CURRENT_SOURCE_DIR}/fixtures/include"
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

# Create helper library if files exist
if(HELPER_SOURCES)
    # Add string_utils.cpp to helper sources
    set(HELPER_WITH_UTILS
        ${HELPER_SOURCES}
        "../../cpp/string_utils.cpp"
    )

    add_library(test_helpers SHARED ${HELPER_WITH_UTILS})
    
    target_compile_definitions(test_helpers PRIVATE
        BUILDING_TEST_HELPERS
        UNIT_TEST=1
        NAPI_DISABLE_CPP_EXCEPTIONS
        MOCK_NAPI
    )

    if(WIN32)
        target_compile_definitions(test_helpers PRIVATE
            _WINDLL
            WINDOWS_BUILD
            UNICODE=1
        )
        set_target_properties(test_helpers PROPERTIES
            WINDOWS_EXPORT_ALL_SYMBOLS ON
        )
    endif()

    target_include_directories(test_helpers PUBLIC 
        ${CMAKE_CURRENT_SOURCE_DIR}/helpers/include
        ${CMAKE_CURRENT_SOURCE_DIR}/mocks/include
        ${GTEST_INCLUDE_DIRS}
        ${GMOCK_INCLUDE_DIRS}
        "../../cpp"
    )
    
    target_link_libraries(test_helpers PUBLIC
        GTest::gtest
        GTest::gmock
        test_mocks
    )
endif()

# For test_mocks:
# When adding the test_mocks library, ensure it gets the right compile definitions
if(MOCK_SOURCES)
    add_library(test_mocks SHARED ${MOCK_SOURCES})
    
    target_compile_definitions(test_mocks PUBLIC
        UNIT_TEST=1
        NAPI_DISABLE_CPP_EXCEPTIONS
        MOCK_NAPI
    )
    
    target_compile_definitions(test_mocks PRIVATE
        BUILDING_MOCK_NAPI
    )

    if(WIN32)
        target_compile_definitions(test_mocks PRIVATE
            _WINDLL
            WINDOWS_BUILD
            UNICODE=1
        )
        set_target_properties(test_mocks PROPERTIES
            WINDOWS_EXPORT_ALL_SYMBOLS ON
        )
    endif()

    target_include_directories(test_mocks PUBLIC 
        ${CMAKE_CURRENT_SOURCE_DIR}/mocks/include
        ${GTEST_INCLUDE_DIRS}
        ${GMOCK_INCLUDE_DIRS}
        "../../cpp"
        "${NODE_HEADERS_DIR}/include/node"
    )
    
    target_link_libraries(test_mocks PUBLIC
        GTest::gtest
        GTest::gmock
    )
endif()

# Create fixture library if files exist
if(FIXTURE_SOURCES)
    add_library(test_fixtures ${FIXTURE_SOURCES})
    
    # Add the same compile definitions as test_mocks
    target_compile_definitions(test_fixtures PUBLIC
        UNIT_TEST=1
        NAPI_DISABLE_CPP_EXCEPTIONS
        MOCK_NAPI
        BUILDING_NODE_EXTENSION
    )
    if(WIN32)
        target_compile_definitions(test_fixtures PRIVATE
            _WINDLL
        )
    endif()

    target_include_directories(test_fixtures PUBLIC 
        ${CMAKE_CURRENT_SOURCE_DIR}/fixtures/include
        ${CMAKE_CURRENT_SOURCE_DIR}/mocks/include
        ${CMAKE_CURRENT_SOURCE_DIR}/helpers/include
        ${GTEST_INCLUDE_DIRS}
        ${GMOCK_INCLUDE_DIRS}
        "../../cpp"
        "${NODE_HEADERS_DIR}/include/node"
    )

    # Ensure test_mocks is linked if it exists
    if(MOCK_SOURCES)
        target_link_libraries(test_fixtures PUBLIC test_mocks)
    endif()
    
    if(HELPER_SOURCES)
        target_link_libraries(test_fixtures PUBLIC test_helpers)
    endif()

    target_link_libraries(test_fixtures PUBLIC
        GTest::gtest
        GTest::gmock
    )
endif()

# Add test executable
add_executable(cpp_tests ${SOURCE_FILES} ${TEST_SOURCES})

# Define compilation flags for testing
target_compile_definitions(cpp_tests PRIVATE
    UNIT_TEST=1
    NAPI_DISABLE_CPP_EXCEPTIONS
    MOCK_NAPI
    BUILDING_NODE_EXTENSION
)

if(WIN32)
    target_compile_definitions(cpp_tests PRIVATE
        _WINDLL
        WINDOWS_BUILD
        UNICODE=1
    )
endif()

# Add include directories
target_include_directories(cpp_tests PRIVATE
    "${NODE_HEADERS_DIR}/include/node"
    "${NODE_HEADERS_DIR}/src"
    "${NODE_HEADERS_DIR}/deps/openssl/config"
    "${NODE_HEADERS_DIR}/deps/openssl/openssl/include"
    "${NODE_HEADERS_DIR}/deps/uv/include"
    "${NODE_HEADERS_DIR}/deps/zlib"
    "${NODE_HEADERS_DIR}/deps/v8/include"
    "${NODE_ADDON_API_DIR}"
    "../../cpp"
    "${CMAKE_CURRENT_SOURCE_DIR}/mocks/include"
    "${CMAKE_CURRENT_SOURCE_DIR}/helpers/include"
    "${CMAKE_CURRENT_SOURCE_DIR}/fixtures/include"
)

# Platform-specific settings for Node.js
if(WIN32)
    set_target_properties(cpp_tests PROPERTIES LINK_FLAGS "/NODEFAULTLIB:msvcrt.lib")
else()
    if(NODE_LIB)
        target_link_libraries(cpp_tests PRIVATE ${NODE_LIB})
    endif()
    target_link_libraries(cpp_tests PRIVATE pthread dl)
endif()

# Link all required libraries
target_link_libraries(cpp_tests PRIVATE
    ${ODBC_LIBRARIES}
    GTest::gtest
    GTest::gtest_main
    GTest::gmock
    GTest::gmock_main
    test_mocks
    test_helpers  # Make sure this is here
    $<$<BOOL:${FIXTURE_SOURCES}>:test_fixtures>
)

# Configure test discovery
if(MSVC)
    set_target_properties(cpp_tests PROPERTIES
        VS_DEBUGGER_WORKING_DIRECTORY "${CMAKE_CURRENT_BINARY_DIR}"
        VS_DEBUGGER_COMMAND_ARGUMENTS "--gtest_output=xml:test_results.xml"
    )
endif()

gtest_discover_tests(cpp_tests
    WORKING_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}
    DISCOVERY_MODE PRE_TEST
    PROPERTIES 
        TIMEOUT 120
        WORKING_DIRECTORY ${CMAKE_CURRENT_BINARY_DIR}
)