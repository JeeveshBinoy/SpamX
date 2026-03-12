from pathlib import Path
import os
from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent
load_dotenv(BASE_DIR / ".env")

# YouTube
YOUTUBE_API_KEY = os.getenv("YOUTUBE_API_KEY", "")

# HuggingFace
HF_SPACE_ID = os.getenv("HF_SPACE_ID", "SpamX/SpamX_HF")
HF_TOKEN = os.getenv("HF_TOKEN", None)

SECRET_KEY = 'django-insecure-@$*@-db5)zn%pa&oq(w9^l+_7$nlz2-x+1=4-+oj3fcj^_9r+c'
DEBUG = True
ALLOWED_HOSTS = ["*"]

INSTALLED_APPS = [
    'django.contrib.contenttypes',
    'django.contrib.auth',
    'rest_framework',
    'corsheaders',
    'api',
]

MIDDLEWARE = [
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
]

ROOT_URLCONF = 'spam_detector.urls'
WSGI_APPLICATION = 'spam_detector.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': BASE_DIR / 'db.sqlite3',
    }
}

LANGUAGE_CODE = 'en-us'
TIME_ZONE = 'UTC'
USE_I18N = True
USE_TZ = True
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# CORS — allow everything for local dev
CORS_ALLOW_ALL_ORIGINS = True
CORS_ALLOW_PRIVATE_NETWORK = True
CORS_ALLOW_HEADERS = ["*"]
CORS_ALLOW_METHODS = ["GET", "POST", "OPTIONS"]

# Logging — shows every request in terminal
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
        },
    },
    "loggers": {
        "django.request": {
            "handlers": ["console"],
            "level": "DEBUG",
            "propagate": False,
        },
        "django.server": {
            "handlers": ["console"],
            "level": "INFO",
            "propagate": False,
        },
    },
}