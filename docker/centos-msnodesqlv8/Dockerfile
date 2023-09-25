FROM centos:7

RUN yum install -y centos-release-scl
RUN yum install -y devtoolset-8
RUN scl enable devtoolset-8 bash

RUN ACCEPT_EULA=Y \
  yum install -y sudo vim git wget lzma-devel curl perl-core perl-IPC-Cmd dialog apt-utils ca-certificates apt-transport-https locales gnupg2 openssl lsb-release

RUN curl https://packages.microsoft.com/config/rhel/7/prod.repo > /etc/yum.repos.d/mssql-release.repo

RUN yum remove unixODBC-utf16 unixODBC-utf16-devel

RUN yum install -y unixODBC-devel

RUN yum install -y gmp-devel mpfr-devel libmpc-devel wget
RUN wget https://ftp.gnu.org/gnu/gcc/gcc-11.2.0/gcc-11.2.0.tar.gz
RUN tar xf gcc-11.2.0.tar.gz
SHELL [ "/usr/bin/scl", "enable", "devtoolset-8"]
RUN (which gcc; gcc --version; mkdir gcc-11.2.0-build; cd gcc-11.2.0-build; ../gcc-11.2.0/configure --enable-languages=c,c++ --disable-multilib; make && make install)
RUN export LD_LIBRARY_PATH=/usr/local/lib64:${LD_LIBRARY_PATH}

RUN ACCEPT_EULA=Y \
  yum install -y python3 unixodbc unixodbc-dev unixODBC-devel libiodbc

RUN ACCEPT_EULA=Y \
  yum install -y msodbcsql18
RUN ACCEPT_EULA=Y \
  yum install -y mssql-tools18

run curl -sL https://rpm.nodesource.com/setup_16.x | bash -
RUN ACCEPT_EULA=Y \
  yum install -y nodejs iputils
RUN npm install --g yarn
RUN npm install --g yarn
RUN npm install --g npm-check-updates
RUN useradd -ms /bin/bash apprunner
ENV LD_LIBRARY_PATH /usr/local/lib64
RUN (export LD_LIBRARY_PATH=/usr/local/lib64:${LD_LIBRARY_PATH};)
RUN mkdir -p $HOME/projects
# RUN git clone https://github.com/openssl/openssl.git --depth 1 --branch openssl-3.1.1 $HOME/projects/openssl
RUN (cd $HOME/projects; git clone https://github.com/openssl/openssl.git --depth 1 --branch openssl-3.1.1; cd $HOME/projects/openssl ; ./config --prefix=/usr/local/ssl --openssldir=/usr/local/ssl shared; make; make install )
RUN (cd /etc/ld.so.conf.d/; echo '/usr/local/ssl/lib64/' | tee openssl-3.2.0.1s.conf;)
RUN (cd /usr/local/ssl; mv certs certs.old; ln -s /etc/ssl/certs certs)
RUN ldconfig -v

RUN yum install -y pcre-devel zlib-devel
RUN (cd $HOME/projects; wget https://ftp.openssl.org/source/old/1.1.1/openssl-1.1.1.tar.gz; pwd; ls; tar xvf openssl-1.1.1.tar.gz; cd $HOME/projects/openssl-1.1.1; ./config --prefix=/usr/local/ssl.1 --openssldir=/usr/local/ssl.1 shared; make; make install)
RUN (cd /etc/ld.so.conf.d/; mv openssl-3.2.0.1s.conf ~/projects; echo '/usr/local/ssl.1/lib/' | tee openssl-1.1.0.1s.conf;)
RUN (cd /usr/local/ssl.1 mv certs certs.old; ln -s /etc/ssl/certs certs)
RUN ldconfig -v

RUN (mkdir -p $HOME/projects/nodejs; cd $HOME/projects/nodejs; wget https://nodejs.org/dist/v16.20.1/node-v16.20.1.tar.gz; tar xf node-v16.20.1.tar.gz; cd node-v16.20.1; ./configure; make; make install)

USER apprunner

# take latest ssl1 and compile from src with gcc11 as installed version causes double free error

RUN (mkdir -p $HOME/app; cd $HOME/app; git clone https://github.com/TimelordUK/msnodesqlv8_yarn_sample.git; cd msnodesqlv8_yarn_sample; )
RUN (mkdir -p $HOME/app/driver/node_modules; cd $HOME/app/driver/node_modules; odbcinst -j; git clone https://github.com/TimelordUK/node-sqlserver-v8.git msnodesqlv8; cd msnodesqlv8; npm install)
