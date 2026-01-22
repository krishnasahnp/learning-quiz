"""
WSGI configuration for PythonAnywhere deployment.

This file is used by PythonAnywhere to run your Flask application.
Update the path in the PythonAnywhere web app configuration to point to this file.
"""
import sys
from pathlib import Path

# Add your project directory to the sys.path
project_home = Path(__file__).resolve().parent
if str(project_home) not in sys.path:
    sys.path.insert(0, str(project_home))

# Import your Flask app
from flask_app import app as application

# PythonAnywhere looks for an 'application' object
# The above import creates it by importing 'app' and renaming it to 'application'
