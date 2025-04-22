#pragma once
// undo these tokens to use numeric_limits below

#undef min
#undef max
#include <platform.h>
#include <limits>
#include <vector>
#include <string.h>
#include <memory>

#ifdef LINUX_BUILD
#include <cmath>
#include <cfloat>
#endif

namespace mssql {

    class DataStorage {
    public:
        typedef long long int bigint_t; 
        typedef std::vector<uint16_t> uint16_t_vec_t;
        typedef std::vector<std::shared_ptr<uint16_t_vec_t>> uint16_vec_t_vec_t;
        typedef std::vector<char> char_vec_t;
        typedef std::vector<std::shared_ptr<char_vec_t>> char_vec_t_vec_t;
        typedef std::vector<int8_t> int8_vec_t;
        typedef std::vector<int16_t> int16_vec_t;
        typedef std::vector<int32_t> int32_vec_t;
        typedef std::vector<uint32_t> uint32_vec_t;
        typedef std::vector<int64_t> int64_vec_t;
        typedef std::vector<double> double_vec_t;
        typedef std::vector<bigint_t> bigint_vec_t;
       // typedef std::vector<SQL_SS_TIMESTAMPOFFSET_STRUCT> timestamp_offset_vec_t;
       // typedef std::vector<SQL_SS_TIME2_STRUCT> time2_struct_vec_t;
        typedef std::vector<SQL_TIMESTAMP_STRUCT> timestamp_struct_vec_t;
        typedef std::vector<SQL_DATE_STRUCT> date_struct_vec_t;
        typedef std::vector<SQL_NUMERIC_STRUCT> numeric_struct_vec_t;

        template<typename T>
        std::shared_ptr<std::vector<T>> reserve(size_t size) {
            auto& storage = getStorage<T>();
            if (!storage) {
                storage = std::make_shared<std::vector<T>>(size);
            } else if (size > storage->capacity()) {
                storage->reserve(size);
            }
            return storage;
        }
        
        // Primary template declaration - no implementation here
        template<typename T>
        std::shared_ptr<std::vector<T>>& getStorage();

        // No specializations inside the class definition

    private:
        // Storage for different types
        std::shared_ptr<int8_vec_t> int8vec_ptr;
        std::shared_ptr<int16_vec_t> int16vec_ptr;
        std::shared_ptr<int32_vec_t> int32vec_ptr;
        std::shared_ptr<uint32_vec_t> uint32vec_ptr;
        std::shared_ptr<int64_vec_t> int64vec_ptr;
        std::shared_ptr<double_vec_t> doublevec_ptr;
        // std::shared_ptr<timestamp_offset_vec_t> timestampoffsetvec_ptr;
        // std::shared_ptr<time2_struct_vec_t> time2vec_ptr;
        std::shared_ptr<timestamp_struct_vec_t> timestampvec_ptr;
        std::shared_ptr<date_struct_vec_t> datevec_ptr;
        std::shared_ptr<numeric_struct_vec_t> numeric_ptr;
        std::shared_ptr<char_vec_t> charvec_ptr;
        std::shared_ptr<uint16_t_vec_t> uint16vec_ptr;
        std::shared_ptr<uint16_vec_t_vec_t> uint16_vec_vec_ptr;
        std::shared_ptr<char_vec_t_vec_t> char_vec_vec_ptr;
        std::shared_ptr<bigint_vec_t> bigint_vec_ptr;
    };

    template<>
    std::shared_ptr<DataStorage::int8_vec_t>& DataStorage::getStorage<int8_t>() { 
        return int8vec_ptr; 
    }

    template<>
    std::shared_ptr<DataStorage::int16_vec_t>& DataStorage::getStorage<int16_t>() { 
        return int16vec_ptr; 
    }

    template<>
    std::shared_ptr<DataStorage::int32_vec_t>& DataStorage::getStorage<int32_t>() {
        return int32vec_ptr;
    }

    template<>
    std::shared_ptr<DataStorage::uint32_vec_t>& DataStorage::getStorage<uint32_t>() {
        return uint32vec_ptr;
    }

// And so on for all your types...

} // namespace mssql