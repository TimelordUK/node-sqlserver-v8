#pragma once

#ifdef _WIN32
#ifdef BUILDING_TEST_HELPERS
#define TEST_HELPER_API __declspec(dllexport)
#else
#define TEST_HELPER_API __declspec(dllimport)
#endif
#else
#define TEST_HELPER_API
#endif