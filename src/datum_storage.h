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

    enum class SqlType {
        Unknown,
        TinyInt, SmallInt, Integer, BigInt, UnsignedInt,
        Real, Float, Double, Decimal, Numeric,
        Char, VarChar, Text, NChar, NVarChar, NText, Binary, VarBinary,
        Date, Time, DateTime, DateTime2, DateTimeOffset,
        Bit, Variant
        // Add other SQL types as needed
    };
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
        typedef std::vector<SQL_SS_TIMESTAMPOFFSET_STRUCT> timestamp_offset_vec_t;
        typedef std::vector<SQL_SS_TIME2_STRUCT> time2_struct_vec_t;
        typedef std::vector<SQL_TIMESTAMP_STRUCT> timestamp_struct_vec_t;
        typedef std::vector<SQL_DATE_STRUCT> date_struct_vec_t;
        typedef std::vector<SQL_NUMERIC_STRUCT> numeric_struct_vec_t;

          // Constructor that takes the SQL type
        explicit DataStorage(SqlType type = SqlType::Unknown) : sqlType(type) {}
    
        // Get the SQL type of this column storage
        SqlType getType() const { 
            return sqlType; 
        }
        
        // Set the SQL type (in case it wasn't known at construction)
        void setType(SqlType type) {
            sqlType = type;
        }

        // Constructor
        DataStorage() = default;
            
        // Destructor - explicit for clarity
        ~DataStorage() = default;

        // Disable copy to prevent accidental copies of large data
        DataStorage(const DataStorage&) = delete;

        // But allow move semantics
        DataStorage(DataStorage&&) = default;
        DataStorage& operator=(DataStorage&&) = default;

        DataStorage& operator=(const DataStorage&) = delete;

        // Improved reserve method
        template<typename T>
        std::shared_ptr<std::vector<T>> reserve(size_t size) {
            auto& storage = getStorage<T>();
            if (!storage) {
                storage = std::make_shared<std::vector<T>>();
                storage->reserve(size);
            } else if (size > storage->capacity()) {
                storage->reserve(size);
            }
            return storage;
        }
            
        template<typename T>
        void addValue(const T& value) {
            auto& storage = getStorage<T>();
            if (!storage) {
                storage = std::make_shared<std::vector<T>>();
            }
            storage->push_back(value);
        }
        
        template<typename T>
        T getValue(size_t index) {
            auto& storage = getStorage<T>();
            if (!storage || index >= storage->size()) {
                throw std::out_of_range("Index out of range or storage not initialized");
            }
            return (*storage)[index];
        }

        // Helper to get column size (number of values in this column)
        size_t size() const {
            switch (sqlType) {
                case SqlType::TinyInt:
                    return int8vec_ptr ? int8vec_ptr->size() : 0;
                case SqlType::SmallInt:
                    return int16vec_ptr ? int16vec_ptr->size() : 0;
                case SqlType::Integer:
                    return int32vec_ptr ? int32vec_ptr->size() : 0;
                case SqlType::BigInt:
                    return int64vec_ptr ? int64vec_ptr->size() : 0;
                case SqlType::UnsignedInt:
                    return uint32vec_ptr ? uint32vec_ptr->size() : 0; 
                case SqlType::Real:
                case SqlType::Float:
                case SqlType:: Double:
                    return doublevec_ptr ? doublevec_ptr->size() : 0; 
                case SqlType::Numeric:
                    return numeric_ptr ? numeric_ptr->size() : 0; 
                                                              
                // ... handle other types
                default:
                    return 0;
            }
        }

        // Primary template declaration - no implementation here
        template<typename T>
        std::shared_ptr<std::vector<T>>& getStorage();

        template<typename T>
        std::shared_ptr<std::vector<T>> extractStorage() {
            auto& storage = getStorage<T>();
            auto result = storage;
            storage = nullptr;  // Transfer ownership
            return result;
        }

        template<typename T>
        void addValues(const std::vector<T>& values) {
            auto& storage = getStorage<T>();
            if (!storage) {
                storage = std::make_shared<std::vector<T>>(values);
            } else {
                storage->insert(storage->end(), values.begin(), values.end());
            }
        }

        template<typename T>
        bool hasStorage() const {
            const auto& storage = const_cast<DataStorage*>(this)->getStorage<T>();
            return storage != nullptr && !storage->empty();
        }

        template<typename T>
        std::vector<T>* getRawStorage() {
            auto& storage = getStorage<T>();
            return storage ? storage.get() : nullptr;
        }

        // No specializations inside the class definition

        void reset() {
            int8vec_ptr = nullptr;
            int16vec_ptr = nullptr;
            int32vec_ptr = nullptr;
            int64vec_ptr = nullptr;
            doublevec_ptr = nullptr;
            timestampoffsetvec_ptr = nullptr;
            time2vec_ptr = nullptr;
            timestampvec_ptr = nullptr;
            datevec_ptr = nullptr;
            numeric_ptr = nullptr;
            charvec_ptr = nullptr;
            uint16vec_ptr = nullptr;
            uint16_vec_vec_ptr = nullptr;
            char_vec_vec_ptr = nullptr;
            bigint_vec_ptr = nullptr;
            sqlType = SqlType::Unknown;
        }

    private:
        // Storage for different types
        std::shared_ptr<int8_vec_t> int8vec_ptr;
        std::shared_ptr<int16_vec_t> int16vec_ptr;
        std::shared_ptr<int32_vec_t> int32vec_ptr;
        std::shared_ptr<uint32_vec_t> uint32vec_ptr;
        std::shared_ptr<int64_vec_t> int64vec_ptr;
        std::shared_ptr<double_vec_t> doublevec_ptr;
        std::shared_ptr<timestamp_offset_vec_t> timestampoffsetvec_ptr;
        std::shared_ptr<time2_struct_vec_t> time2vec_ptr;
        std::shared_ptr<timestamp_struct_vec_t> timestampvec_ptr;
        std::shared_ptr<date_struct_vec_t> datevec_ptr;
        std::shared_ptr<numeric_struct_vec_t> numeric_ptr;
        std::shared_ptr<char_vec_t> charvec_ptr;
        std::shared_ptr<uint16_t_vec_t> uint16vec_ptr;
        std::shared_ptr<uint16_vec_t_vec_t> uint16_vec_vec_ptr;
        std::shared_ptr<char_vec_t_vec_t> char_vec_vec_ptr;
        std::shared_ptr<bigint_vec_t> bigint_vec_ptr;
        // Store the SQL type this instance represents
        SqlType sqlType = SqlType::Unknown;
    
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