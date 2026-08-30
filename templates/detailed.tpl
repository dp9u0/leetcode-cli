${comment.start}
${comment.line} @lc app=${app} id=${fid} lang=${lang}
${comment.line}
${comment.line} [${fid}] ${name}
${comment.line}
${comment.line} ${link}
${comment.line}
${comment.line} ${category}
${comment.line} ${level} (${percent}%)
${comment.line} Likes:    ${likes}
${comment.line} Dislikes: ${dislikes}
${comment.line} Total Accepted:    ${totalAC}
${comment.line} Total Submissions: ${totalSubmit}
${comment.line} Testcase Example:  ${testcase}
${comment.line}
{{ desc.forEach(function(x) { }}${comment.line} ${x}
{{ }) }}{{ (hints || []).forEach(function(hint, index) { }}${comment.line}
${comment.line} Hint ${index + 1}:
${comment.line} ${hint}
{{ }) }}${comment.end}

${comment.singleLine} @lc code=start
${code}
${comment.singleLine} @lc code=end
