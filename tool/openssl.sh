if ! [[ "18.04 20.04 22.04" == *"$(lsb_release -rs)"* ]];
then
    echo "Ubuntu $(lsb_release -rs) is not currently supported.";
    exit;
fi

cd /home/appveyor/projects
git clone https://github.com/openssl/openssl.git
cd openssl
./config --prefix=/usr/local/ssl --openssldir=/usr/local/ssl shared zlib
make
# make test
sudo su
sudo make install
cd /etc/ld.so.conf.d/
echo "/usr/local/ssl/lib64/" > openssl-3.2.0.1s.conf
sudo ldconfig -v
