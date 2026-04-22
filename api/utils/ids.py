from hashlib import blake2b


def id62(num: int) -> str:
    uid = ""
    A = [chr(i) for i in [*range(48, 58), *range(65, 91), *range(97, 123)]]
    while num:
        num, m = divmod(num, 62)
        uid = A[m] + uid
    return uid


def id7(value: int | str) -> str:
    return id62(int(blake2b(str(value).encode(), digest_size=5).hexdigest(), 16))
