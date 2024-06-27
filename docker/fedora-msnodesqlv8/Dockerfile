FROM fedora:38

RUN yum install -y sudo vim git wget ca-certificates  openssl iputils

RUN curl https://packages.microsoft.com/config/rhel/9/prod.repo | sudo tee /etc/yum.repos.d/mssql-release.repo
  
RUN yum remove unixODBC-utf16 unixODBC-utf16-devel #to avoid conflicts
RUN ACCEPT_EULA=Y yum install -y msodbcsql18
  # optional: for bcp and sqlcmd
RUN ACCEPT_EULA=Y yum install -y mssql-tools18

RUN yum install -y python3 
RUN ACCEPT_EULA=Y yum install -y nodejs npm
RUN useradd -ms /bin/bash apprunner
RUN npm install --global yarn
USER apprunner
RUN (mkdir -p $HOME/app; cd $HOME/app; git clone https://github.com/TimelordUK/msnodesqlv8_yarn_sample.git; cd msnodesqlv8_yarn_sample; yarn install)
RUN (mkdir -p $HOME/app/driver/node_modules; cd $HOME/app/driver/node_modules; odbcinst -j; git clone https://github.com/TimelordUK/node-sqlserver-v8.git msnodesqlv8; cd msnodesqlv8; npm install)
