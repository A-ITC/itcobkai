"""ログファイルの設定."""

from logging import Formatter, Logger, StreamHandler, getLogger
from logging.handlers import RotatingFileHandler
from os import makedirs

from .config import LOG_DIR, LOG_LEVEL


def init_logger(name: str) -> Logger:
    """ログの設定."""
    formatter = Formatter("[%(asctime)s] %(levelname)s: %(message)s")
    sh = StreamHandler()
    sh.setFormatter(formatter)

    lib_logger = getLogger(__name__.split(".")[0])
    lib_logger.setLevel(LOG_LEVEL)
    lib_logger.addHandler(sh)

    if LOG_DIR:
        # nameの値でログファイルを変える
        # 100kB毎にログローテーションする
        makedirs(LOG_DIR, exist_ok=True)
        fd = f"{LOG_DIR}/{name}.log"
        fh = RotatingFileHandler(fd, maxBytes=100 * 1024)
        fh.setFormatter(formatter)
        lib_logger.addHandler(fh)

    main_logger = getLogger("__main__")
    main_logger.setLevel(LOG_LEVEL)
    main_logger.addHandler(sh)
    main_logger.addHandler(fh)
    return main_logger
