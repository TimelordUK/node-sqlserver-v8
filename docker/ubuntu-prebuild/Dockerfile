FROM ubuntu:20.04
RUN echo 'APT::Install-Suggests "0";' >> /etc/apt/apt.conf.d/00-docker
RUN echo 'APT::Install-Recommends "0";' >> /etc/apt/apt.conf.d/00-docker

RUN DEBIAN_FRONTEND=noninteractive \
  apt-get update \
  && apt-get install -y vim git build-essential curl perl dialog apt-utils ca-certificates apt-transport-https locales gnupg2 openssl lsb-release gcc-10 g++-10

RUN curl https://packages.microsoft.com/keys/microsoft.asc | tee | apt-key add -
RUN curl https://packages.microsoft.com/config/ubuntu/$(lsb_release -rs)/prod.list > /etc/apt/sources.list.d/mssql-release.list
RUN curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
RUN echo msodbcsql18 msodbcsql/ACCEPT_EULA boolean true | debconf-set-selections

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
RUN DEBIAN_FRONTEND=noninteractive \
  apt-get update \
  && apt-get install -y iputils-ping curl

RUN useradd -ms /bin/bash apprunner
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
RUN . ${HOME}/.nvm/nvm.sh && nvm install 22 && npm install -g yarn && npm install -g npm-check-updates && chmod -R 755 ${HOME}

USER apprunner
RUN curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
RUN export NVM_DIR="$HOME/.nvm" && . $HOME/.nvm/nvm.sh; nvm install 22

WORKDIR /home/apprunner/build
COPY --chown=apprunner:apprunner . .

# Install dependencies
RUN . ${HOME}/.nvm/nvm.sh && npm install

# Create prebuild script
RUN cat > prebuild.sh << 'EOF'
#!/bin/bash
set -e

if [ -z "$GITHUB_TOKEN" ]; then
    echo "Error: GITHUB_TOKEN environment variable is required"
    exit 1
fi

. ${HOME}/.nvm/nvm.sh

echo "Building Node.js prebuilds..."
CC=gcc-10 CXX=g++-10 node_modules/.bin/prebuild -t 18.0.0 -t 20.0.0 -t 22.0.0 -t 23.0.0 -t 24.0.0 --strip -u $GITHUB_TOKEN

echo "Building Electron prebuilds..."
CC=gcc-10 CXX=g++-10 node_modules/.bin/prebuild -t 32.0.0 -t 33.0.0 -t 34.0.0 -t 35.0.0 -t 36.0.0 -r electron --strip -u $GITHUB_TOKEN

echo "Prebuild complete!"
EOF

RUN chmod +x prebuild.sh

CMD ["./prebuild.sh"]