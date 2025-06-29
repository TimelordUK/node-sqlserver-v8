cmake_minimum_required(VERSION 3.14)
project(msnodesqlv8 CXX)

# Set C++ standard
set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

# Platform-specific settings
if(WIN32)
    # Windows-specific settings
    add_definitions(-DWINDOWS_BUILD -DUNICODE -DBUILDING_NODE_EXTENSION -DNOMINMAX)
    set(ODBC_LIBRARIES odbc32)
else()
    # Linux/Mac settings
    add_definitions(-DLINUX_BUILD -DUNICODE -DBUILDING_NODE_EXTENSION)
    
    # Find ODBC libraries
    find_package(ODBC REQUIRED)
    
    # Link pthread and other system libraries
    set(SYSTEM_LIBRARIES pthread dl rt)
endif()

# Include directories
include_directories(
    ${CMAKE_SOURCE_DIR}/include
    ${CMAKE_SOURCE_DIR}/include/common
    ${CMAKE_SOURCE_DIR}/include/core
    ${CMAKE_SOURCE_DIR}/include/js
    ${CMAKE_SOURCE_DIR}/include/odbc
    ${CMAKE_SOURCE_DIR}/include/utils
)

# Source files
file(GLOB_RECURSE COMMON_SOURCES "src/common/*.cpp")
file(GLOB_RECURSE CORE_SOURCES "src/core/*.cpp")
file(GLOB_RECURSE JS_SOURCES "src/js/*.cpp")
file(GLOB_RECURSE ODBC_SOURCES "src/odbc/*.cpp")
file(GLOB_RECURSE UTILS_SOURCES "src/utils/*.cpp")

# Main target
add_library(sqlserver MODULE
    binding.cpp
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
    target_link_libraries(sqlserver ${ODBC_LIBRARIES} ${SYSTEM_LIBRARIES})
endif()

# Set output name based on platform
if(WIN32)
    set_target_properties(sqlserver PROPERTIES
        OUTPUT_NAME "sqlserver"
        SUFFIX ".node"
    )
else()
    set_target_properties(sqlserver PROPERTIES
        OUTPUT_NAME "sqlserver"
        PREFIX ""
        SUFFIX ".node"
    )
endif()