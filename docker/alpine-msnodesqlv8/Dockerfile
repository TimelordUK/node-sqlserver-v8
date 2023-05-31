FROM alpine:3.18

RUN apk update && \
	apk add curl gcc libc-dev g++ libffi-dev libxml2 unixodbc unixodbc-dev openssl perl gnupg python3 git vim pingu nodejs make npm bash

RUN curl -O https://download.microsoft.com/download/1/f/f/1fffb537-26ab-4947-a46a-7a45c27f6f77/msodbcsql18_18.2.1.1-1_amd64.apk
RUN curl -O https://download.microsoft.com/download/1/f/f/1fffb537-26ab-4947-a46a-7a45c27f6f77/mssql-tools18_18.2.1.1-1_amd64.apk

#(Optional) Verify signature, if 'gpg' is missing install it using 'apk add gnupg':

RUN curl -O https://download.microsoft.com/download/1/f/f/1fffb537-26ab-4947-a46a-7a45c27f6f77/msodbcsql18_18.2.1.1-1_amd64.sig
RUN curl -O https://download.microsoft.com/download/1/f/f/1fffb537-26ab-4947-a46a-7a45c27f6f77/mssql-tools18_18.2.1.1-1_amd64.sig

RUN curl https://packages.microsoft.com/keys/microsoft.asc  | gpg --import -
RUN gpg --verify msodbcsql18_18.2.1.1-1_amd64.sig msodbcsql18_18.2.1.1-1_amd64.apk
RUN gpg --verify mssql-tools18_18.2.1.1-1_amd64.sig mssql-tools18_18.2.1.1-1_amd64.apk

#Install the package(s)

RUN apk add --allow-untrusted msodbcsql18_18.2.1.1-1_amd64.apk
RUN apk add --allow-untrusted mssql-tools18_18.2.1.1-1_amd64.apk

RUN npm install --g yarn
RUN npm install --g npm-check-updates
RUN apk add doas; \
        adduser apprunner; \
        echo 'apprunner:123' | chpasswd; \
        echo 'permit apprunner as root' > /etc/doas.d/doas.conf

USER apprunner
RUN (mkdir -p $HOME/app; cd $HOME/app; git clone https://github.com/TimelordUK/msnodesqlv8_yarn_sample.git; cd msnodesqlv8_yarn_sample; yarn install)
RUN (mkdir -p $HOME/app/driver/node_modules; cd $HOME/app/driver/node_modules; git clone https://github.com/TimelordUK/node-sqlserver-v8.git msnodesqlv8; cd msnodesqlv8; npm install)
