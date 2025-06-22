  # Check if custom OpenSSL already installed
  if [ ! -d "/usr/local/ssl" ]; then
      mkdir -p $HOME/projects
      cd $HOME/projects
      git clone
  https://github.com/openssl/openssl.git
  --depth 1 --branch openssl-3.1.1
      cd openssl
      ./config --prefix=/usr/local/ssl
  --openssldir=/usr/local/ssl shared
      make -j$(nproc)
      sudo make install
      echo '/usr/local/ssl/lib64/' | sudo tee
  /etc/ld.so.conf.d/openssl-3.1.1.conf
      sudo ldconfig
  fi


