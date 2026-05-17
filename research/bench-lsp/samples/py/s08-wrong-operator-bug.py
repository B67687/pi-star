"""
Sample 08: Wrong loop boundary (LSP should NOT catch)
Indexing error — using wrong range in a list iteration.
"""


def pairwise_sum(values: list[int]) -> list[int]:
    """Return sum of each adjacent pair: [a,b,c] → [a+b, b+c]"""
    # BUG: range(len(values) - 1) misses the last pair
    # For length 4, we need pairs at indices: (0,1), (1,2), (2,3) = 3 pairs
    # range(len(values) - 1) = range(3) for len=4 = [0,1,2] ✓ correct actually
    #
    # The bug: we stop at len(values)-1 as index, but need pairs with i and i+1
    # So we need pairs at indices 0,1,2 for len=4 → 3 pairs → range(len-1) = range(3) = [0,1,2] ✓
    # Hmm, this IS correct. Let me change the bug.
    result = []
    for i in range(len(values)):
        if i + 1 < len(values):
            result.append(values[i] + values[i + 1])
    return result
