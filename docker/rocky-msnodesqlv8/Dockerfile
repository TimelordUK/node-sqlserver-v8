FROM rockylinux:9

RUN ACCEPT_EULA=Y \
  yum install -y sudo vim git wget perl-core perl-IPC-Cmd dialog ca-certificates gnupg2 openssl

RUN curl https://packages.microsoft.com/config/rhel/7/prod.repo > /etc/yum.repos.d/mssql-release.repo

RUN yum remove unixODBC-utf16 unixODBC-utf16-devel

RUN yum install -y unixODBC-devel

RUN yum install -y gmp-devel mpfr-devel libmpc-devel wget

RUN ACCEPT_EULA=Y \
  yum install -y python3 unixODBC unixODBC-devel 

RUN ACCEPT_EULA=Y \
  yum install -y msodbcsql18
RUN ACCEPT_EULA=Y \
  yum install -y mssql-tools18

RUN curl -sL https://rpm.nodesource.com/setup_20.x | bash -
RUN ACCEPT_EULA=Y \
  yum install -y nodejs iputils
RUN npm install --g yarn
RUN npm install --g npm-check-updates
RUN useradd -ms /bin/bash apprunner
ENV LD_LIBRARY_PATH /usr/local/lib64
RUN (export LD_LIBRARY_PATH=/usr/local/lib64:${LD_LIBRARY_PATH};)
RUN mkdir -p $HOME/projects

USER apprunner
RUN unset nvm
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
RUN export NVM_DIR="$HOME/.nvm" && . $HOME/.nvm/nvm.sh; nvm install 22
RUN . ${HOME}/.nvm/nvm.sh; npm install -g yarn
# RUN . ${HOME}/.nvm/nvm.sh && nvm install 22 && npm install -g yarn && npm install -g npm-check-updates 
RUN . ${HOME}/.nvm/nvm.sh; (mkdir -p $HOME/app; cd $HOME/app; git clone https://github.com/TimelordUK/msnodesqlv8_yarn_sample.git; cd msnodesqlv8_yarn_sample; yarn install)
RUN . ${HOME}/.nvm/nvm.sh; (mkdir -p $HOME/app/driver/node_modules; cd $HOME/app/driver/node_modules; git clone https://github.com/TimelordUK/node-sqlserver-v8.git msnodesqlv8; cd msnodesqlv8; npm install)

