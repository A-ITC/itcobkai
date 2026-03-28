from hashlib import blake2b


def id62(num):
    uid = ""
    A = [chr(i) for i in [*range(48, 58), *range(65, 91), *range(97, 123)]]
    while num:
        num, m = divmod(num, 62)
        uid = A[m] + uid
    return uid


def id7(num):
    return id62(int(blake2b(str(num).encode(), digest_size=5).hexdigest(), 16))


def blake(text):
    return id62(int(blake2b(text.encode(), digest_size=9).hexdigest(), 16))
