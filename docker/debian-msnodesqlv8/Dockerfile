FROM debian:latest

RUN echo 'APT::Install-Suggests "0";' >> /etc/apt/apt.conf.d/00-docker
RUN echo 'APT::Install-Recommends "0";' >> /etc/apt/apt.conf.d/00-docker

RUN DEBIAN_FRONTEND=noninteractive \
  apt-get update \
  && apt-get install -y vim git build-essential curl perl dialog apt-utils ca-certificates apt-transport-https locales gnupg2 openssl lsb-release

RUN curl https://packages.microsoft.com/keys/microsoft.asc | apt-key add -

#Download appropriate package for the OS version
#Choose only ONE of the following, corresponding to your OS version

#Debian 11
RUN curl https://packages.microsoft.com/config/debian/11/prod.list > /etc/apt/sources.list.d/mssql-release.list

RUN DEBIAN_FRONTEND=noninteractive \
  apt-get update \
  && apt-get install -y python3 unixodbc unixodbc-dev
RUN ACCEPT_EULA=Y \
  apt-get install -y msodbcsql18
RUN ACCEPT_EULA=Y \
  apt-get install -y mssql-tools18 

RUN mkdir -p $HOME/projects
RUN git clone https://github.com/openssl/openssl.git --depth 1 --branch openssl-3.1.1 $HOME/projects/openssl
RUN ( cd $HOME/projects/openssl ; ./config --prefix=/usr/local/ssl --openssldir=/usr/local/ssl shared; make; make install)
RUN (cd /etc/ld.so.conf.d/; echo '/usr/local/ssl/lib64/' | tee openssl-3.2.0.1s.conf;)
RUN (cd /usr/local/ssl; mv certs certs.old; ln -s /etc/ssl/certs certs)
RUN ldconfig -v

RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
RUN DEBIAN_FRONTEND=noninteractive \
  apt-get update \
  && apt-get install -y nodejs iputils-ping
RUN npm install --g yarn
RUN npm install --g npm-check-updates
RUN useradd -ms /bin/bash apprunner
USER apprunner
RUN (mkdir -p $HOME/app; cd $HOME/app; git clone https://github.com/TimelordUK/msnodesqlv8_yarn_sample.git; cd msnodesqlv8_yarn_sample; yarn install)
RUN (mkdir -p $HOME/app/driver/node_modules; cd $HOME/app/driver/node_modules; git clone https://github.com/TimelordUK/node-sqlserver-v8.git msnodesqlv8; cd msnodesqlv8; npm install)
RUN echo 'export PATH="$PATH:/opt/mssql-tools18/bin"' >> ~/.bashrc

