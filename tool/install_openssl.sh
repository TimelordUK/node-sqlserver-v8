$clone_folder=$HOME/projects
 if [ "$nodejs_version" -ge "18" ]; then
    cd $clone_folder
    tool/openssl.sh
fi
