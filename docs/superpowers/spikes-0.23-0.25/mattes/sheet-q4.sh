#!/bin/sh
# Contact sheet for Q4: reference / test / difference (x3.3) for the cases that are not bit-exact. Run from this folder.
B=${1:-default}
for n in nested_comp_moved_scaled_rotated threeD_comp_rotationY_25_holding_the_matte MATTE_layer_has_parent_a_moving_null_; do
  magick q4-$B-$n-ref.png q4-$B-$n-test.png -alpha off -compose difference -composite -level 0,30% q4-$B-$n-diff.png
done
montage -label '%t' \
  q4-$B-nested_comp_moved_scaled_rotated-ref.png q4-$B-nested_comp_moved_scaled_rotated-test.png q4-$B-nested_comp_moved_scaled_rotated-diff.png \
  q4-$B-threeD_comp_rotationY_25_holding_the_matte-ref.png q4-$B-threeD_comp_rotationY_25_holding_the_matte-test.png q4-$B-threeD_comp_rotationY_25_holding_the_matte-diff.png \
  q4-$B-MATTE_layer_has_parent_a_moving_null_-ref.png q4-$B-MATTE_layer_has_parent_a_moving_null_-test.png q4-$B-MATTE_layer_has_parent_a_moving_null_-diff.png \
  -tile 3x -geometry 320x180+4+20 -pointsize 10 sheet-q4-$B.png
