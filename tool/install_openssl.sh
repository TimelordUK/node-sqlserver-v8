FOLDER=/home/appveyor/projects/node_modules/msnodesqlv8
echo "node version $nodejs_version folder $FOLDER"
 if [ "$nodejs_version" -ge "18" ]; then
    cd $FOLDER
    chmod 775 tool/openssl.sh
    tool/openssl.sh
fi
