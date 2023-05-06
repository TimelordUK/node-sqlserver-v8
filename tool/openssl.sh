if ! [[ "18.04 20.04 22.04" == *"$(lsb_release -rs)"* ]];
then
    echo "Ubuntu $(lsb_release -rs) is not currently supported.";
    exit;
fi
mkdir -p $HOME/projects
cd $HOME/projects
git clone https://github.com/openssl/openssl.git
cd openssl
./config --prefix=/usr/local/ssl --openssldir=/usr/local/ssl shared
make
# make test
sudo make install
cd /etc/ld.so.conf.d/
echo '/usr/local/ssl/lib64/' | sudo tee openssl-3.2.0.1s.conf
sudo ldconfig -v
