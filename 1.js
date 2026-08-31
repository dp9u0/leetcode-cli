/*
 * @lc app=leetcode id=1 lang=javascript
 *
 * [1] Two Sum
 */

// @lc code=start
/**
 * @param {number[]} nums
 * @param {number} target
 * @return {number[]}
 */
var twoSum = function(nums, target) {
  let map = {};
  for (var index = 0; index < nums.length; index++) {
      var element = nums[index];
      let rest = target - element;
      if (map.hasOwnProperty(rest)) {
          return [map[rest], index];
      }
      map[element] = index;
  }
  return [-1, -1];
};
/**
// TEST:
console.log(twoSum([2, 9, 4, 5], 7));
*/
// @lc code=end
