"""
calculate_connections() / connections_to_islands() のユニットテスト（LiveKit 不要）

接続ルール:
  1. 同じ島にいる → 距離不問で接続
  2. 両方が島の外 → チェビシェフ距離 1 で接続。A-B, B-C なら A-C も推移的に接続
  3. 片方が島の中、片方が島の外 → 隣接していても接続しない
"""

from api.master.connections import calculate_connections, connections_to_islands
from api.master.grid import label_islands


# ---------------------------------------------------------------------------
# ヘルパー
# ---------------------------------------------------------------------------


def _make_grid(rows: list[str]) -> list[list[bool]]:
    """文字列リストから bool グリッドを作る（"1" → True, "0" → False）"""
    return [[ch == "1" for ch in row] for row in rows]


def _island_ids(area: list[list[bool]]) -> list[list[int]]:
    height = len(area)
    width = len(area[0]) if height else 0
    return label_islands(area, width, height)


# ---------------------------------------------------------------------------
# ルール 1: 同じ島にいる → 距離不問で接続
# ---------------------------------------------------------------------------


class TestRule1SameIsland:
    def test_two_users_in_same_island_are_connected(self):
        """島内の 2 ユーザーは距離によらず接続される"""
        area = _make_grid(["111", "111", "111"])
        ids = _island_ids(area)
        # A=(0,0), B=(2,2) — 遠く離れているが同じ島
        positions = {"A": (0, 0), "B": (2, 2)}
        result = calculate_connections(positions, ids, area)
        assert len(result) == 1
        assert set(result[0]) == {"A", "B"}

    def test_users_in_different_islands_are_not_connected(self):
        """異なる島にいる 2 ユーザーは接続されない（隣接しているが別島）"""
        # 左の島と右の島を 1 列の空白で分ける
        area = _make_grid(["10001", "10001", "10001"])
        ids = _island_ids(area)
        # A=(0,0) 左島, B=(4,0) 右島
        positions = {"A": (0, 0), "B": (4, 0)}
        result = calculate_connections(positions, ids, area)
        assert result == []

    def test_three_users_all_in_same_island(self):
        """3 ユーザーが同じ島にいれば全ペアが接続される"""
        area = _make_grid(["111", "111"])
        ids = _island_ids(area)
        positions = {"A": (0, 0), "B": (1, 0), "C": (2, 1)}
        result = calculate_connections(positions, ids, area)
        assert len(result) == 1
        assert set(result[0]) == {"A", "B", "C"}


# ---------------------------------------------------------------------------
# ルール 2: 両方が島の外 → チェビシェフ距離 1 で接続
# ---------------------------------------------------------------------------


class TestRule2BothOutside:
    def test_adjacent_outside_users_are_connected(self):
        """両方が島の外で隣接（チェビシェフ距離 1）→ 接続"""
        area = _make_grid(["000", "000", "000"])  # 全て島外
        ids = _island_ids(area)
        positions = {"A": (0, 0), "B": (1, 0)}
        result = calculate_connections(positions, ids, area)
        assert len(result) == 1
        assert set(result[0]) == {"A", "B"}

    def test_diagonal_adjacent_outside_users_are_connected(self):
        """対角（チェビシェフ距離 1）も接続"""
        area = _make_grid(["000", "000", "000"])
        ids = _island_ids(area)
        positions = {"A": (0, 0), "B": (1, 1)}
        result = calculate_connections(positions, ids, area)
        assert len(result) == 1
        assert set(result[0]) == {"A", "B"}

    def test_non_adjacent_outside_users_are_not_connected(self):
        """両方が島の外だが距離 2 以上 → 接続されない"""
        area = _make_grid(["000", "000", "000"])
        ids = _island_ids(area)
        positions = {"A": (0, 0), "B": (2, 0)}
        result = calculate_connections(positions, ids, area)
        assert result == []

    def test_transitive_chain_outside_abc(self):
        """A-B, B-C が接続（島外チェーン）→ A-C も推移的に接続"""
        area = _make_grid(["00000"])
        ids = _island_ids(area)
        # A=(0,0), B=(1,0), C=(2,0) — それぞれ隣接
        positions = {"A": (0, 0), "B": (1, 0), "C": (2, 0)}
        result = calculate_connections(positions, ids, area)
        assert len(result) == 1
        assert set(result[0]) == {"A", "B", "C"}

    def test_transitive_chain_abc_not_connected_to_isolated_d(self):
        """A-B-C チェーンが接続されても、離れた D とは接続されない"""
        area = _make_grid(["000000"])
        ids = _island_ids(area)
        positions = {"A": (0, 0), "B": (1, 0), "C": (2, 0), "D": (5, 0)}
        result = calculate_connections(positions, ids, area)
        assert len(result) == 1
        assert set(result[0]) == {"A", "B", "C"}


# ---------------------------------------------------------------------------
# ルール 3: 片方が島の中、片方が島の外 → 隣接していても接続しない
# ---------------------------------------------------------------------------


class TestRule3MixedIslandAndOutside:
    def test_island_user_and_outside_user_adjacent_not_connected(self):
        """島内ユーザーと島外ユーザーが隣接していても接続しない"""
        # 左半分が島、右半分が島外
        area = _make_grid(["110", "110", "110"])
        ids = _island_ids(area)
        # A=(1,0) 島内, B=(2,0) 島外 — チェビシェフ距離 1
        positions = {"A": (1, 0), "B": (2, 0)}
        result = calculate_connections(positions, ids, area)
        assert result == []

    def test_island_user_and_far_outside_user_not_connected(self):
        """島内ユーザーと遠い島外ユーザーも当然接続されない"""
        area = _make_grid(["11000", "11000"])
        ids = _island_ids(area)
        positions = {"A": (0, 0), "B": (4, 0)}
        result = calculate_connections(positions, ids, area)
        assert result == []

    def test_outside_user_cannot_bridge_two_islands_via_outside(self):
        """島外ユーザーが 2 つの島の間に立っても島同士は繋がらない

        レイアウト: 島A | 島外C | 島B
        C は island_A_user と island_B_user のいずれにも隣接しているが、
        ルール 3 により島内↔島外の接続は成立しない → island_A_user と island_B_user は非接続
        """
        area = _make_grid(["10001"])
        ids = _island_ids(area)
        # island_A_user=(0,0) 島内, C=(1,0) 島外, island_B_user=(4,0) 島内
        positions = {"island_A_user": (0, 0), "C": (1, 0), "island_B_user": (4, 0)}
        result = calculate_connections(positions, ids, area)
        assert result == []

    def test_three_users_island_outside_outside_chain(self):
        """島内 A、島外 B（A に隣接）、島外 C（B に隣接）のとき B-C のみ接続"""
        area = _make_grid(["10000"])
        ids = _island_ids(area)
        positions = {"A": (0, 0), "B": (1, 0), "C": (2, 0)}
        result = calculate_connections(positions, ids, area)
        assert len(result) == 1
        assert set(result[0]) == {"B", "C"}


# ---------------------------------------------------------------------------
# connections_to_islands
# ---------------------------------------------------------------------------


class TestConnectionsToIslands:
    def test_empty_connections(self):
        """接続なしのとき空リスト"""
        assert connections_to_islands(set()) == []

    def test_single_connection(self):
        """1 ペアの接続 → 1 グループ"""
        islands = connections_to_islands({("A", "B")})
        assert len(islands) == 1
        assert set(islands[0]) == {"A", "B"}

    def test_two_separate_connections(self):
        """2 つの独立したペア → 2 グループ"""
        islands = connections_to_islands({("A", "B"), ("C", "D")})
        assert len(islands) == 2
        groups = [set(g) for g in islands]
        assert {"A", "B"} in groups
        assert {"C", "D"} in groups

    def test_transitive_chain(self):
        """A-B, B-C の 2 ペア → 1 グループ {A,B,C}"""
        islands = connections_to_islands({("A", "B"), ("B", "C")})
        assert len(islands) == 1
        assert set(islands[0]) == {"A", "B", "C"}
