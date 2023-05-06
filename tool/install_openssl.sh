$clone_folder=$HOME/projects/node_modules/msnodesqlv8
echo "node version $nodejs_version"
 if [ "$nodejs_version" -ge "18" ]; then
    cd $clone_folder
    tool/openssl.sh
fi
