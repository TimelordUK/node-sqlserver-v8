#pragma once
#include <string>
#include <vector>
#include <memory>
#include <mutex>


namespace mssql
{
    class QueryParameter;

    class ParameterSet {   
        typedef std::vector<std::shared_ptr<QueryParameter>> qp_vec_t;
        public:
            ParameterSet();
            void add(std::shared_ptr<QueryParameter> qp);
            const std::vector<std::shared_ptr<QueryParameter>> getParams() { return parameters_; }
        private:
            std::vector<std::shared_ptr<QueryParameter>> parameters_;
    };
}