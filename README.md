<p align="center">
  <img src="resources/banner.svg" alt="intime Banner" width="45%">
</p>
<p align="center">
  <img alt="GitHub Repo stars" src="https://img.shields.io/github/stars/ber2minsin/intime" style="margin-right: 10px;">
  <img alt="GitHub contributors" src="https://img.shields.io/github/contributors/ber2minsin/intime" style="margin-right: 10px;">
  <img alt="Issues" src="https://img.shields.io/github/issues/ber2minsin/intime" style="margin-right: 10px;">
  <img alt="Python Version" src="https://img.shields.io/badge/python-3.10+-blue">
</p>

### 🕒 Overview

[intime](https://github.com/ber2minsin/intime) is a privacy-focused time tracking application that automatically monitors your **active windows** and **applications** to help you understand how you spend your time on your computer.

With intime, you can make **informed decisions** about your work habits and improve your efficiency.

### ✨ Features

### 🚀 Installation

### 📊 Usage

### Setting up a development environment

#### Creating a virtual environment

We recommend using [uv](https://github.com/astral-sh/uv) to manage the dependencies of this project. First, start by creating a virtual environment:

```bash
uv venv --python 3.12.0
```

> ❗ **Warning**: This would install python 3.12.0 in your virtual environment even if you have a different version of python installed on your system. If you want to use the python version installed on your system, you can use the `--python` flag to specify the path to the python executable.

Alternatively you can use the `venv` module that comes with Python:

```bash
python -m venv .venv
```

#### Activating the virtual environment

You should activate the virtual environment before installing the dependencies. On Windows, you can do this by running:

```bash
.venv\Scripts\activate
```

On Linux or MacOS, you can do this by running:

```bash
. .venv/bin/activate # you should also use the corresponding shell, e.g. bash, zsh, fish, etc.
```

#### Managing dependencies

Each commit has to include the locked dependencies, which reside under `requirements.txt` under the relevant component's direcotry. To install the dependencies, run:

```bash
uv pip install -r requirements.txt
```

or if you are using the `venv` module:

```bash
pip install -r requirements.txt
```

If you want to add new dependencies, you should add the dependency to the `requirements.in` under the desired component of the project. Then, you can run the following command to update the `requirements.txt` file:

```bash
uv pip compile /path/to/requirements.in --output-file /path/to/requirements.txt
```

we also have a base requirements.in file at the root of this project for lazy programmers who do not want to type the path of the relevant module everytime they add a dependency (such as myself).

Since we are using `requirements.in` for declaring dependencies, you need to use one of `pip-tools` or `uv` to install the dependencies. If this becomes a problem, please open an issue and we will try to work on a solution. In theory, you should only need to install these tools if you plan to add new dependencies to the project, which is not common anyways.

You should refer to their documentation for more information on how to install and use them. At the time of writing this document, python and pip is all you need to be able to install and run these tools.

### 📝 License

This project is licensed under the AGPL-3.0 License - see the LICENSE file for details.

### 🙏 Acknowledgements

<p align="center"> Made with ❤️ by <a href="https://github.com/ber2minsin">Ber2</a> </p>
