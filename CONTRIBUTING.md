
# Contribution Guidelines Overview

If you would like to become involved in the development of the [Microsoft Driver for Node.js for SQL Server][Project], there are many different ways in which you can contribute. We strongly value user feedback and will appreciate your questions, bug reports and feature requests. For more details how you can submit those see section Using the product and providing feedback below. In addition you can also contribute changes to the code, which include bug fixes and improvements as well as new features. For more details how to do this please see section Contributing changes below.

## Using the product and providing feedback

Using the Microsoft Driver for Node.js for SQL Server, asking and answering question, reporting bugs and making feature requests are critical parts of the project community. User feedback is crucial for improving the quality of the products and drive further development.
In order to become familiar with the functionality you can donwnload the pre-compiled binaries (see Obtaining the binaries below) or synch the source code from Github and compile locally (see Obtaining the source code below). Once you become familiar with the functionality you can report bugs or request new features (see Report bugs and request features below).

### Asking and answering questions

The easiest way to ask and answer questions is to visit the [Issues][Issues] page, and ask a question there.

### Obtaining the binaries

Pre-compiled binaries ship **inside the npm package** as of 5.5.0, so
`npm install msnodesqlv8` needs no download and no compiler on a supported
platform. See the platform table in the release notes for what is bundled.

### Setting up a development build

Most contributions only touch the JavaScript in `lib/`, and you should not need
a C++ toolchain for that.

A fresh clone contains no binary: `prebuilds/` and `build/` are both gitignored,
and the `install` script (`node-gyp-build`) compiles from source when it finds
nothing. So a plain `npm install` in a clone will try to build the addon, and
`require`ing the driver before that succeeds fails with:

```
Error: No native build was found for platform=... arch=... runtime=node ...
```

To work on the JavaScript without building the C++, pull the published binary
into your working tree:

```sh
npm install --ignore-scripts
npm run fetch-prebuild
```

That downloads the latest published package from the npm registry and copies its
`prebuilds/` directory into your clone. Pass a version to pin one:

```sh
npm run fetch-prebuild -- 5.5.0
```

`node-gyp-build` resolves `build/Release`, then `build/Debug`, then
`prebuilds/`. A fetched binary is therefore used only while you have not built
from source - if you later run `npm run rebuild`, your own build wins
automatically and there is nothing to undo.

**When you do need to build from source:** if your change touches `cpp/`, or if
`cpp/` has moved on since the release you fetched, the published binary will not
contain your changes and may not match what `lib/` expects. Build it properly:

```sh
npm run rebuild          # release
npm run build:debug      # debug, which lib/util.js prefers if present
```

### Obtaining the source code

In order to obtain the source code you need to become familiar with [Git](http://progit.org/book/) and [Github](http://help.github.com/) and you need to have Git installed on your local machine. You can obtain the source code from the [Project page][Project].

### Report bugs and request features

Issues and feature requests are submitted through the project's [Issues][Issues] section on GitHub. Please use the following guidelines when you submit issues and feature requests:

* Make sure the issue is not already reported by searching through the list of issues
* Provide detailed description of the issue including the following information:
    * Which feature the issue appears in
    * Under what circumstances the issue appears
    * What is desired behavior
    * What is breaking
    * What is the impact (things like loss or corruption of data, compromizing security, disruption of service etc.)
    * Any code that will be helpful to reproduce the issue

Issues are regularly reviewed and updated with additional information by the core team. Sometimes the core team may have questions about particular issue that might need clarifications so, please be ready to provide additional information.

## Contributing changes
### How to become a contributor?

In order to become a contributor to the project we need you to sign the Contributor License Agreement (CLA). Signing the Contributor License Agreement (CLA) does not grant you rights to commit to the main repository but it does mean that we will consider your contributions and you will get credit if we do. Active contributors might be asked to join the core team, and given the ability to merge pull requests.
You can download the Contributor License Agreement (CLA) by clicking at the following [link][CLA]. Please fill in, sign, scan and email it to [cla@microsoft.com](mailto:cla@microsoft.com).

### Create bug fixes and features

You make modifications of the code in your local Git repository. Once you are done with your implementation follow the steps below:

* Change the working branch to master with the following command: ```git checkout master````
* Submit the changes to your own fork in GitHub by using the following command: ```git submit````
* In GitHub create new pull request by clicking on the Pull Request button
* In the pull request select your fork as source and WindowsAzure/node-sqlserver as destination for the request
* Write detailed message describing the changes in the pull request
    Submit the pull request for consideration by the Core Team

Note: All changes and pull request should be done in the master branch if they are bug fixes. Major changes should be coordinated with the core team so that we can set up an improvement branch for this work. Changes will be integrated in a release branch by the Core Team.

Please keep in mind that not all requests will be approved. Requests are reviewed by the Core Team on a regular basis and will be updated with the status at each review. If your request is accepted you will receive information about the next steps and when the request will be integrated in the main branch. If your request is rejected you will receive information about the reasons why it was rejected.
Contribution guidelines

Before you start working on bug fixes and features it is good idea to discuss those broadly with the community. You can file an Issue as described in Asking and answering questions for this purpose.
Before submitting your changes make sure you followed the guidelines below:

* You have properly documented any new functionality using the documentation standards for the language (this includes classes, methods and functions, properties etc.)
*   Proper inline documentation is included for any change you make  
* For any new functionality you have written complete unit tests
* You have ran all unit tests and they pass

In order to speed up the process of accepting your contributions, you should try to make your checkins as small as possible, avoid any unnecessary deltas and the need to rebase. 

[Issues]: https://github.com/WindowsAzure/node-sqlserver/issues
[Project]: https://github.com/WindowsAzure/node-sqlserver/
[Download]: http://www.microsoft.com/en-us/download/details.aspx?id=29995
[CLA]: http://windowsazure.github.com/docs/Contribution%20License%20Agreement.pdf