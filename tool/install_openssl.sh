FOLDER=/home/appveyor/projects/node_modules/msnodesqlv8
echo "node version $nodejs_version folder $FOLDER"
 if [ "$nodejs_version" -ge "18" ]; then
    cd $FOLDER
    tool/openssl.sh
fi
