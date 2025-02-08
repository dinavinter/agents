nvm use 22.8.0
yarn set version 1.22.19
yarn config set yarn-offline-mirror ./npm-packages-offline-cache
yarn config set yarn-offline-mirror-pruning true 
cp ~/.yarnrc .
rm -rf node_modules/ yarn.lock # if they were previously generated
yarn set version 1.22.19
nvm use 22.8.0
yarn install
